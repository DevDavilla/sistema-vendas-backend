require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./src/config/db");

const produtosRoutes = require("./src/routes/produtos");
const clientesRoutes = require("./src/routes/clientes");
const usuariosRoutes = require("./src/routes/usuarios");
const vendasRoutes = require("./src/routes/vendas");
const authRoutes = require("./src/routes/authRoutes");
const relatoriosRoutes = require("./src/routes/relatorios");

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    "http://localhost:5173", // Para o frontend local
    "http://127.0.0.1:5173", // Para o frontend local
    "https://sistema-vendas-backend-no8y.onrender.com",
    "https://196c-190-102-47-102.ngrok-free.app",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions)); // APLICA O CORS COM AS OPÇÕES (PRIMEIRO)
app.use(express.json()); // Depois, o middleware para JSON

// Rota de teste inicial
app.get("/", (req, res) => {
  res.send("API de Gerenciamento de Vendas Online!");
});

// Usa as rotas
app.use("/api/produtos", produtosRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/vendas", vendasRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/relatorios", relatoriosRoutes);

// Inicia o servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acessível na rede local em http://192.168.18.9:${PORT}`);
});
