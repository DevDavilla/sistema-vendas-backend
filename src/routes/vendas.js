const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authMiddleware,
  checkPermission,
} = require("../middlewares/authMiddleware"); // <-- IMPORT DOS MIDDLEWARES

// Rota para REGISTRAR uma nova venda
router.post(
  "/",
  authMiddleware,
  checkPermission("vendedor"),
  async (req, res) => {
    // <-- PROTEGIDA POR VENDEDOR/ADMIN
    const { cliente_id, usuario_id, forma_pagamento, itens } = req.body;

    if (
      !usuario_id ||
      !forma_pagamento ||
      !Array.isArray(itens) ||
      itens.length === 0
    ) {
      return res.status(400).json({
        error:
          "ID do usuário, forma de pagamento e itens da venda são obrigatórios.",
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      let totalVenda = 0;
      const itensVendaParaInserir = [];

      for (const item of itens) {
        const { produto_id, quantidade } = item;

        if (!produto_id || !quantidade || quantidade <= 0) {
          throw new Error(
            "Cada item da venda deve ter um produto_id e uma quantidade válida (> 0)."
          );
        }

        const produtoResult = await client.query(
          "SELECT preco_venda, estoque FROM produtos WHERE id = $1 AND ativo = TRUE FOR UPDATE;",
          [produto_id]
        );

        if (produtoResult.rows.length === 0) {
          throw new Error(
            `Produto com ID ${produto_id} não encontrado ou inativo.`
          );
        }

        const produto = produtoResult.rows[0];

        if (produto.estoque < quantidade) {
          throw new Error(
            `Estoque insuficiente para o produto ${produto_id}. Disponível: ${produto.estoque}, Solicitado: ${quantidade}.`
          );
        }

        const precoUnitarioVendido = parseFloat(produto.preco_venda);
        const subtotal = precoUnitarioVendido * quantidade;
        totalVenda += subtotal;

        itensVendaParaInserir.push({
          produto_id,
          quantidade,
          precoUnitarioVendido,
          subtotal,
        });

        await client.query(
          "UPDATE produtos SET estoque = estoque - $1 WHERE id = $2;",
          [quantidade, produto_id]
        );
      }

      const vendaQuery = `
            INSERT INTO vendas (cliente_id, usuario_id, data_hora, total_venda, forma_pagamento, status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, 'Concluida')
            RETURNING *;
        `;
      const vendaValues = [cliente_id, usuario_id, totalVenda, forma_pagamento];
      const vendaResult = await client.query(vendaQuery, vendaValues);
      const novaVenda = vendaResult.rows[0];

      for (const item of itensVendaParaInserir) {
        const itemVendaQuery = `
                INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario_vendido, subtotal)
                VALUES ($1, $2, $3, $4, $5);
            `;
        const itemVendaValues = [
          novaVenda.id,
          item.produto_id,
          item.quantidade,
          item.precoUnitarioVendido,
          item.subtotal,
        ];
        await client.query(itemVendaQuery, itemVendaValues);
      }

      await client.query("COMMIT");
      res
        .status(201)
        .json({ message: "Venda registrada com sucesso!", venda: novaVenda });
    } catch (err) {
      if (client) {
        await client.query("ROLLBACK");
      }
      console.error("Erro ao registrar venda:", err.message);
      res.status(500).json({
        error: `Erro interno do servidor ao registrar venda: ${err.message}`,
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// Rota para LISTAR todas as vendas
router.get(
  "/",
  authMiddleware,
  checkPermission("vendedor"),
  async (req, res) => {
    // <-- PROTEGIDA POR VENDEDOR/ADMIN
    try {
      const result = await pool.query(
        "SELECT * FROM vendas ORDER BY data_hora DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Erro ao listar vendas:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao listar vendas." });
    }
  }
);

// Rota para OBTER detalhes de uma venda específica (com seus itens)
router.get(
  "/:id",
  authMiddleware,
  checkPermission("vendedor"),
  async (req, res) => {
    // <-- PROTEGIDA POR VENDEDOR/ADMIN
    const { id } = req.params;
    try {
      const vendaResult = await pool.query(
        "SELECT * FROM vendas WHERE id = $1",
        [id]
      );
      if (vendaResult.rows.length === 0) {
        return res.status(404).json({ error: "Venda não encontrada." });
      }
      const venda = vendaResult.rows[0];

      const itensResult = await pool.query(
        `SELECT iv.*, p.nome as nome_produto, p.preco_venda as preco_atual_produto
             FROM itens_venda iv
             JOIN produtos p ON iv.produto_id = p.id
             WHERE iv.venda_id = $1;`,
        [id]
      );
      venda.itens = itensResult.rows;

      res.json(venda);
    } catch (err) {
      console.error(`Erro ao obter detalhes da venda com ID ${id}:`, err);
      res.status(500).json({
        error: "Erro interno do servidor ao obter detalhes da venda.",
      });
    }
  }
);

router.put(
  "/:id/cancelar",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect(); // Obtém uma conexão do pool

    try {
      await client.query("BEGIN"); // Inicia uma transação

      // 1. Obter os itens da venda antes de cancelar
      const itensVendaResult = await client.query(
        "SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = $1",
        [id]
      );
      const itensVenda = itensVendaResult.rows;

      if (itensVenda.length === 0) {
        // Se a venda não tem itens, apenas atualiza o status
        await client.query(
          "UPDATE vendas SET status = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *",
          ["Cancelada", id]
        );
        await client.query("COMMIT");
        return res.status(200).json({
          message: `Venda ${id} cancelada com sucesso (sem itens para estornar).`,
        });
      }

      // 2. Atualizar o estoque de cada produto
      for (const item of itensVenda) {
        await client.query(
          "UPDATE produtos SET estoque = estoque + $1, atualizado_em = NOW() WHERE id = $2",
          [item.quantidade, item.produto_id]
        );
      }

      // 3. Atualizar o status da venda para 'Cancelada'
      const result = await client.query(
        "UPDATE vendas SET status = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *",
        ["Cancelada", id]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK"); // Reverte se a venda não for encontrada
        return res.status(404).json({ error: "Venda não encontrada." });
      }

      await client.query("COMMIT"); // Confirma a transação
      res.status(200).json({
        message: `Venda ${id} cancelada e estoque atualizado com sucesso.`,
        venda: result.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK"); // Reverte em caso de erro
      console.error("Erro ao cancelar venda e estornar estoque:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao cancelar venda." });
    } finally {
      client.release(); // Libera a conexão
    }
  }
);

module.exports = router;
