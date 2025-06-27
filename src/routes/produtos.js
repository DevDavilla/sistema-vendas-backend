const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authMiddleware,
  checkPermission,
} = require("../middlewares/authMiddleware");

// Rota para LISTAR todos os produtos
router.get("/", authMiddleware, async (req, res) => {
  // Já está protegida
  try {
    const result = await pool.query("SELECT * FROM produtos ORDER BY nome ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao listar produtos." });
  }
});

// Rota para ADICIONAR um novo produto
router.post("/", authMiddleware, checkPermission("admin"), async (req, res) => {
  // <-- PROTEGIDA POR ADMIN
  const { nome, descricao, preco_venda, estoque, codigo_barras } = req.body;

  if (!nome || preco_venda === undefined || estoque === undefined) {
    return res.status(400).json({
      error: "Nome, preço de venda e estoque são campos obrigatórios.",
    });
  }
  if (isNaN(parseFloat(preco_venda)) || isNaN(parseInt(estoque))) {
    return res
      .status(400)
      .json({ error: "Preço de venda e estoque devem ser números válidos." });
  }

  try {
    const query = `
            INSERT INTO produtos (nome, descricao, preco_venda, estoque, codigo_barras, criado_em, atualizado_em)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
    const values = [
      nome,
      descricao,
      preco_venda,
      estoque,
      codigo_barras,
      new Date(),
      new Date(),
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao adicionar produto:", err);
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "Nome do produto ou código de barras já existe." });
    }
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao adicionar produto." });
  }
});

// Rota para ATUALIZAR um produto existente
router.put(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    console.log(`Requisição PUT para produto ID: ${req.params.id} recebida.`);
    const { id } = req.params;
    const { nome, descricao, preco_venda, estoque, codigo_barras, ativo } =
      req.body;

    if (
      !nome &&
      !descricao &&
      preco_venda === undefined &&
      estoque === undefined &&
      !codigo_barras &&
      ativo === undefined
    ) {
      return res
        .status(400)
        .json({ error: "Nenhum campo fornecido para atualização." });
    }

    let queryParts = [];
    let queryValues = [];
    let paramIndex = 1;

    if (nome !== undefined) {
      queryParts.push(`nome = $${paramIndex++}`);
      queryValues.push(nome);
    }
    if (descricao !== undefined) {
      queryParts.push(`descricao = $${paramIndex++}`);
      queryValues.push(descricao);
    }
    if (preco_venda !== undefined) {
      if (isNaN(parseFloat(preco_venda))) {
        return res
          .status(400)
          .json({ error: "Preço de venda deve ser um número válido." });
      }
      queryParts.push(`preco_venda = $${paramIndex++}`);
      queryValues.push(preco_venda);
    }
    if (estoque !== undefined) {
      if (isNaN(parseInt(estoque))) {
        return res
          .status(400)
          .json({ error: "Estoque deve ser um número inteiro válido." });
      }
      queryParts.push(`estoque = $${paramIndex++}`);
      queryValues.push(estoque);
    }
    if (codigo_barras !== undefined) {
      queryParts.push(`codigo_barras = $${paramIndex++}`);
      queryValues.push(codigo_barras);
    }
    if (ativo !== undefined) {
      if (typeof ativo !== "boolean") {
        return res.status(400).json({
          error: 'O campo "ativo" deve ser um valor booleano (true/false).',
        });
      }
      queryParts.push(`ativo = $${paramIndex++}`);
      queryValues.push(ativo);
    }

    queryParts.push(`atualizado_em = CURRENT_TIMESTAMP`);
    queryValues.push(id);

    try {
      const query = `
            UPDATE produtos
            SET ${queryParts.join(", ")}
            WHERE id = $${paramIndex}
            RETURNING *;
        `;

      const result = await pool.query(query, queryValues);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Produto não encontrado." });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Erro ao atualizar produto:", err);
      if (err.code === "23505") {
        return res
          .status(409)
          .json({ error: "Nome do produto ou código de barras já existe." });
      }
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao atualizar produto." });
    }
  }
);

// Rota para DELETAR um produto
router.delete(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    // <-- PROTEGIDA POR ADMIN
    const { id } = req.params;

    try {
      const result = await pool.query(
        "DELETE FROM produtos WHERE id = $1 RETURNING *;",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Produto não encontrado." });
      }

      res.json({
        message: `Produto com ID ${id} deletado com sucesso.`,
        deletedProduct: result.rows[0],
      });
    } catch (err) {
      console.error("Erro ao deletar produto:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao deletar produto." });
    }
  }
);

module.exports = router;
