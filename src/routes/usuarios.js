require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const {
  authMiddleware,
  checkPermission,
} = require("../middlewares/authMiddleware");

const saltRounds = 10;

// Rota para LISTAR todos os usuários
// Protegida: Requer autenticação (qualquer usuário logado pode ver)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nome_usuario, permissao, ativo, criado_em FROM usuarios ORDER BY nome_usuario ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao listar usuários." });
  }
});

// Rota para OBTER um usuário por ID
// Protegida: Requer autenticação (qualquer usuário logado pode ver)
router.get("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, nome_usuario, permissao, ativo, criado_em FROM usuarios WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Erro ao obter usuário com ID ${id}:`, err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao obter usuário." });
  }
});

// Rota para REGISTRAR um novo usuário
// Protegida: Apenas admin pode registrar novos usuários
router.post("/", authMiddleware, checkPermission("admin"), async (req, res) => {
  const { nome_usuario, senha, permissao } = req.body;

  if (!nome_usuario || !senha) {
    return res
      .status(400)
      .json({ error: "Nome de usuário e senha são obrigatórios." });
  }
  const allowedPermissions = ["admin", "vendedor"];
  const finalPermission =
    permissao && allowedPermissions.includes(permissao)
      ? permissao
      : "vendedor";

  try {
    const senha_hash = await bcrypt.hash(senha, saltRounds);

    const query = `
            INSERT INTO usuarios (nome_usuario, senha_hash, permissao, ativo, criado_em)
            VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP)
            RETURNING id, nome_usuario, permissao, ativo, criado_em;
        `;
    const values = [nome_usuario, senha_hash, finalPermission];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao registrar usuário:", err);
    if (
      err.code === "23505" &&
      err.constraint === "usuarios_nome_usuario_key"
    ) {
      return res.status(409).json({ error: "Nome de usuário já existe." });
    }
    res
      .status(500)
      .json({ error: "Erro interno do servidor ao registrar usuário." });
  }
});

// Rota para ATUALIZAR um usuário existente
// Protegida: Apenas admin pode atualizar usuários
router.put(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { id } = req.params;
    const { nome_usuario, senha, permissao, ativo } = req.body;

    if (
      !nome_usuario &&
      !senha &&
      permissao === undefined &&
      ativo === undefined
    ) {
      return res
        .status(400)
        .json({ error: "Nenhum campo fornecido para atualização." });
    }

    let queryParts = [];
    let queryValues = [];
    let paramIndex = 1;

    if (nome_usuario !== undefined) {
      queryParts.push(`nome_usuario = $${paramIndex++}`);
      queryValues.push(nome_usuario);
    }
    if (senha !== undefined) {
      const nova_senha_hash = await bcrypt.hash(senha, saltRounds);
      queryParts.push(`senha_hash = $${paramIndex++}`);
      queryValues.push(nova_senha_hash);
    }
    if (permissao !== undefined) {
      const allowedPermissions = ["admin", "vendedor"];
      if (!allowedPermissions.includes(permissao)) {
        return res
          .status(400)
          .json({ error: 'Permissão inválida. Use "admin" ou "vendedor".' });
      }
      queryParts.push(`permissao = $${paramIndex++}`);
      queryValues.push(permissao);
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

    queryValues.push(id);

    try {
      const query = `
            UPDATE usuarios
            SET ${queryParts.join(", ")}
            WHERE id = $${paramIndex}
            RETURNING id, nome_usuario, permissao, ativo, criado_em;
        `;

      const result = await pool.query(query, queryValues);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
      if (
        err.code === "23505" &&
        err.constraint === "usuarios_nome_usuario_key"
      ) {
        return res.status(409).json({ error: "Nome de usuário já existe." });
      }
      res
        .status(500)
        .json({ error: "Erro interno do servidor ao atualizar usuário." });
    }
  }
);

// Rota para DELETAR um usuário
// Protegida: Apenas admin pode desativar/deletar usuários
router.delete(
  "/:id",
  authMiddleware,
  checkPermission("admin"),
  async (req, res) => {
    const { id } = req.params;

    if (parseInt(id) === req.userId) {
      return res.status(403).json({
        error: "Você não pode deletar seu próprio usuário através desta rota.",
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN"); // Inicia a transação

      // 1. Verificar se o usuário tem vendas associadas
      const vendasCountResult = await client.query(
        "SELECT COUNT(*) FROM vendas WHERE usuario_id = $1;",
        [id]
      );
      const vendasCount = parseInt(vendasCountResult.rows[0].count);

      if (vendasCount > 0) {
        // Se o usuário tem vendas, DESATIVA em vez de deletar
        const updateResult = await client.query(
          "UPDATE usuarios SET ativo = FALSE WHERE id = $1 RETURNING id, nome_usuario, ativo;",
          [id]
        );

        if (updateResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Usuário não encontrado." });
        }

        await client.query("COMMIT");
        return res.json({
          message: `Usuário "${updateResult.rows[0].nome_usuario}" (ID: ${id}) foi desativado porque possui vendas associadas.`,
          user: updateResult.rows[0],
        });
      } else {
        // Se o usuário NÃO tem vendas, DELETA
        const deleteResult = await client.query(
          "DELETE FROM usuarios WHERE id = $1 RETURNING id, nome_usuario;",
          [id]
        );

        if (deleteResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Usuário não encontrado." });
        }

        await client.query("COMMIT");
        return res.json({
          message: `Usuário "${deleteResult.rows[0].nome_usuario}" (ID: ${id}) deletado permanentemente.`,
          deletedUser: deleteResult.rows[0],
        });
      }
    } catch (err) {
      if (client) {
        await client.query("ROLLBACK");
      }
      console.error("Erro ao processar exclusão/desativação de usuário:", err);
      if (err.code === "23503") {
        // Foreign Key Violation
        return res.status(409).json({
          error:
            "Não é possível deletar usuário com vendas associadas. Usuário foi desativado.",
        });
      }
      res
        .status(500)
        .json({ error: `Erro interno do servidor: ${err.message}` });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

module.exports = router;
