require("dotenv").config(); // Garante que o JWT_SECRET do .env seja carregado
const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // Para acessar o banco de dados
const bcrypt = require("bcryptjs"); // Para comparar senhas
const jwt = require("jsonwebtoken"); // Para criar e assinar JWTs

// Rota de Login
router.post("/login", async (req, res) => {
  const { nome_usuario, senha } = req.body;

  // 1. Validação básica de entrada
  if (!nome_usuario || !senha) {
    return res
      .status(400)
      .json({ error: "Nome de usuário e senha são obrigatórios." });
  }

  try {
    // 2. Buscar o usuário no banco de dados
    const userResult = await pool.query(
      "SELECT id, nome_usuario, senha_hash, permissao, ativo FROM usuarios WHERE nome_usuario = $1",
      [nome_usuario]
    );

    const user = userResult.rows[0];

    // 3. Verificar se o usuário existe e está ativo
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }
    if (!user.ativo) {
      return res.status(403).json({ error: "Usuário inativo." });
    }

    // 4. Comparar a senha fornecida com o hash armazenado
    const isMatch = await bcrypt.compare(senha, user.senha_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    // 5. Gerar o JSON Web Token (JWT)
    const token = jwt.sign(
      { userId: user.id, permissao: user.permissao }, // Payload: informações para o token
      process.env.JWT_SECRET, // Segredo para assinar o token
      { expiresIn: "1h" }
    );

    // 6. Retornar o token e algumas informações do usuário
    res.json({
      message: "Login bem-sucedido!",
      token,
      user: {
        id: user.id,
        nome_usuario: user.nome_usuario,
        permissao: user.permissao,
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    res
      .status(500)
      .json({ error: "Erro interno do servidor durante o login." });
  }
});

module.exports = router;
