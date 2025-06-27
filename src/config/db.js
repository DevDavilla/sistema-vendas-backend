require("dotenv").config(); // Carrega as variáveis de ambiente

const { Pool } = require("pg");

// Prioriza DATABASE_URL (para Render) e faz fallback para vars separadas (para local)
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgres://<span class="math-inline">\{process\.env\.DB\_USER\}\:</span>{process.env.DB_PASSWORD}@<span class="math-inline">\{process\.env\.DB\_HOST\}\:</span>{process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false, // Necessário para Render com HTTPS
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
