const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authMiddleware,
  checkPermission,
} = require("../middlewares/authMiddleware");

// Protegida: Apenas administradores podem acessar.
router.get(
  "/vendas-por-periodo",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { data_inicio, data_fim, agrupar_por } = req.query;

    if (!data_inicio || !data_fim) {
      return res
        .status(400)
        .json({ error: "Parâmetros data_inicio e data_fim são obrigatórios." });
    }

    let groupByClause = "TO_CHAR(data_hora, 'YYYY-MM-DD')"; // Padrão: agrupar por dia
    if (agrupar_por === "month") {
      groupByClause = "TO_CHAR(data_hora, 'YYYY-MM')";
    } else if (agrupar_por === "year") {
      groupByClause = "TO_CHAR(data_hora, 'YYYY')";
    }

    try {
      const query = `
            SELECT
                ${groupByClause} as periodo,
                SUM(total_venda) as total_vendido,
                COUNT(id) as total_vendas
            FROM vendas
            WHERE data_hora BETWEEN $1 AND $2
            GROUP BY periodo
            ORDER BY periodo;
        `;
      const values = [data_inicio, data_fim];

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error("Erro ao gerar relatório de vendas por período:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao gerar relatório." });
    }
  }
);

router.get(
  "/produtos-mais-vendidos",
  authMiddleware,
  checkPermission("vendedor"),
  async (req, res) => {
    const { data_inicio, data_fim, limite } = req.query;
    const queryLimit = parseInt(limite) || 10;

    let dateFilter = "";
    const values = [];
    let paramIndex = 1;

    if (data_inicio && data_fim) {
      dateFilter = `AND v.data_hora BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      values.push(data_inicio, data_fim);
    }

    try {
      const query = `
            SELECT
                p.nome as nome_produto,
                SUM(iv.quantidade) as total_quantidade_vendida,
                SUM(iv.subtotal) as total_valor_vendido
            FROM itens_venda iv
            JOIN produtos p ON iv.produto_id = p.id
            JOIN vendas v ON iv.venda_id = v.id
            WHERE v.status = 'Concluida' ${dateFilter}
            GROUP BY p.nome
            ORDER BY total_quantidade_vendida DESC, total_valor_vendido DESC
            LIMIT $${paramIndex};
        `;
      values.push(queryLimit);

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error("Erro ao gerar relatório de produtos mais vendidos:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao gerar relatório." });
    }
  }
);

router.get(
  "/vendas-por-usuario",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { data_inicio, data_fim } = req.query;

    let dateFilter = "";
    const values = [];
    let paramIndex = 1;

    if (data_inicio && data_fim) {
      dateFilter = `WHERE v.data_hora BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      values.push(data_inicio, data_fim);
    }

    try {
      const query = `
            SELECT
                u.nome_usuario,
                u.permissao,
                SUM(v.total_venda) as total_vendido,
                COUNT(v.id) as total_vendas
            FROM vendas v
            JOIN usuarios u ON v.usuario_id = u.id
            ${dateFilter}
            GROUP BY u.nome_usuario, u.permissao
            ORDER BY total_vendido DESC;
        `;

      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error("Erro ao gerar relatório de vendas por usuário:", err);
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao gerar relatório." });
    }
  }
);

module.exports = router;
