const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  authMiddleware,
  checkPermission,
} = require("../middlewares/authMiddleware"); // Importa os middlewares

// Rota para LISTAR todos os clientes
router.get("/", authMiddleware, async (req, res) => {
  // <-- PROTEGIDA POR QUALQUER USUÁRIO AUTENTICADO
  try {
    const result = await pool.query("SELECT * FROM clientes ORDER BY nome ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar clientes:", err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao listar clientes." });
  }
});

// Rota para OBTER um cliente por ID
router.get("/:id", authMiddleware, async (req, res) => {
  // <-- PROTEGIDA POR QUALQUER USUÁRIO AUTENTICADO
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM clientes WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Erro ao obter cliente com ID ${id}:`, err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao obter cliente." });
  }
});

// Rota para ADICIONAR um novo cliente
router.post("/", authMiddleware, checkPermission("admin"), async (req, res) => {
  // <-- PROTEGIDA POR ADMIN
  const { nome, cpf_cnpj, email, telefone, endereco } = req.body;

  if (!nome || !telefone) {
    return res
      .status(400)
      .json({ error: "Nome e telefone do cliente são obrigatórios." });
  }
  if (typeof telefone !== "string") {
    return res.status(400).json({ error: "Telefone deve ser uma string." });
  }

  try {
    const query = `
            INSERT INTO clientes (nome, cpf_cnpj, email, telefone, endereco, criado_em)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            RETURNING *;
        `;
    const values = [nome, cpf_cnpj, email, telefone, endereco];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao adicionar cliente:", err);
    if (err.code === "23505" && err.constraint === "clientes_telefone_key") {
      return res
        .status(409)
        .json({ error: "Telefone já cadastrado para outro cliente." });
    }
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao adicionar cliente." });
  }
});

// Rota para ATUALIZAR um cliente existente
router.put(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    // <-- PROTEGIDA POR ADMIN
    const { id } = req.params;
    const { nome, cpf_cnpj, email, telefone, endereco } = req.body;

    if (!nome && !cpf_cnpj && !email && !telefone && !endereco) {
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
    if (cpf_cnpj !== undefined) {
      queryParts.push(`cpf_cnpj = $${paramIndex++}`);
      queryValues.push(cpf_cnpj);
    }
    if (email !== undefined) {
      queryParts.push(`email = $${paramIndex++}`);
      queryValues.push(email);
    }
    if (telefone !== undefined) {
      if (typeof telefone !== "string") {
        return res.status(400).json({ error: "Telefone deve ser uma string." });
      }
      queryParts.push(`telefone = $${paramIndex++}`);
      queryValues.push(telefone);
    }
    if (endereco !== undefined) {
      queryParts.push(`endereco = $${paramIndex++}`);
      queryValues.push(endereco);
    }

    queryValues.push(id);

    try {
      const query = `
            UPDATE clientes
            SET ${queryParts.join(", ")}
            WHERE id = $${paramIndex}
            RETURNING *;
        `;

      const result = await pool.query(query, queryValues);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado." });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Erro ao atualizar cliente:", err);
      if (err.code === "23505" && err.constraint === "clientes_telefone_key") {
        return res
          .status(409)
          .json({ error: "Telefone já cadastrado para outro cliente." });
      }
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao atualizar cliente." });
    }
  }
);

// Rota para DELETAR um cliente
router.delete(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await pool.query(
        "DELETE FROM clientes WHERE id = $1 RETURNING *;",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Cliente não encontrado." });
      }

      res.json({
        message: `Cliente com ID ${id} deletado com sucesso.`,
        deletedClient: result.rows[0],
      });
    } catch (err) {
      console.error("Erro ao deletar cliente:", err);

      res.status(500).json({
        error: `Erro interno do servidor ao deletar cliente: ${err.message}`,
      });
    }
  }
);

module.exports = router;
