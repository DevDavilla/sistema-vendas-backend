require("dotenv").config();

const { Pool } = require("pg");
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Tenta conectar ao banco de dados e registra o resultado
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error(
      "❌ ERRO CRÍTICO: Não foi possível conectar ao PostgreSQL. Detalhes do erro:",
      err.message
    );
    console.error(
      "Por favor, verifique as credenciais do DB e se o serviço PostgreSQL está rodando."
    );
    // Para deploy: Se o erro for ECONNREFUSED para 127.0.0.1, significa que DATABASE_URL está errada ou faltando no ambiente.
  } else {
    console.log("✅ Conectado ao PostgreSQL!");
  }
});

module.exports = pool;
