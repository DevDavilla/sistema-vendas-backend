require("dotenv").config(); // Carrega as variáveis de ambiente

const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Tenta conectar ao banco de dados e registra o resultado
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    // Se houver um erro aqui, ele será um problema real na conexão
    console.error(
      "❌ ERRO CRÍTICO: Não foi possível conectar ao PostgreSQL. Detalhes do erro:",
      err.message
    );
    console.error(
      "Por favor, verifique AS CREDENCIAIS NO ARQUIVO .env (especialmente DB_HOST!) e se o serviço PostgreSQL está rodando."
    );
  } else {
    console.log("✅ Conectado ao PostgreSQL!");
  }
});

module.exports = pool;
