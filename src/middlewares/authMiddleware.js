require("dotenv").config(); // Para acessar o JWT_SECRET
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // 1. Obter o token do cabeçalho da requisição
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ error: "Acesso negado. Token não fornecido." });
  }

  try {
    // 2. Verificar e decodificar o token
    // jwt.verify retorna o payload (userId, permissao) se o token for válido
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Anexar as informações do usuário à requisição
    // Assim, as rotas que usarem este middleware terão acesso a req.userId e req.userPermission
    req.userId = decoded.userId;
    req.userPermission = decoded.permissao;

    // 4. Continuar para a próxima função middleware/rota
    next();
  } catch (err) {
    // Se o token for inválido (expirado, assinado incorretamente, etc.)
    console.error("Erro de verificação de token:", err.message);
    return res.status(403).json({ error: "Token inválido ou expirado." });
  }
};

// Middleware para verificar permissão
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    // authMiddleware já deve ter anexado req.userPermission
    if (!req.userPermission) {
      return res.status(403).json({
        error:
          "Permissão não verificada (middleware de autenticação ausente ou falho).",
      });
    }

    if (
      req.userPermission !== requiredPermission &&
      req.userPermission !== "admin"
    ) {
      // Se a permissão do usuário não for a requerida E não for 'admin'
      return res.status(403).json({
        error: `Acesso negado. Necessária permissão de ${requiredPermission}.`,
      });
    }
    next();
  };
};

module.exports = { authMiddleware, checkPermission };
