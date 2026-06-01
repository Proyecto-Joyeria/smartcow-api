#!/usr/bin/env bash
# =============================================================================
# SmartCow API — Generador de claves RSA-4096 para JWT RS256
# =============================================================================
# Uso:
#   chmod +x scripts/gen-keys.sh
#   ./scripts/gen-keys.sh
#
# Genera:
#   - keys/private.pem  → JWT_PRIVATE_KEY  (NUNCA commitear)
#   - keys/public.pem   → JWT_PUBLIC_KEY   (puede ser público)
#   - Imprime las variables de entorno listas para copiar al .env
# =============================================================================

set -euo pipefail

KEYS_DIR="$(dirname "$0")/../keys"
PRIVATE_KEY="$KEYS_DIR/private.pem"
PUBLIC_KEY="$KEYS_DIR/public.pem"

# Crear directorio keys/ si no existe
mkdir -p "$KEYS_DIR"

echo ""
echo "🔑  Generando par de claves RSA-4096 para JWT RS256..."
echo ""

# Generar clave privada RSA-4096
openssl genrsa -out "$PRIVATE_KEY" 4096 2>/dev/null

# Extraer clave pública de la privada
openssl rsa -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY" 2>/dev/null

echo "✅  Claves generadas en $KEYS_DIR/"
echo ""

# Mostrar las variables de entorno listas para pegar en .env
# Las claves se formatean con \n para ser compatibles con variables de entorno de una sola línea
echo "══════════════════════════════════════════════════════════════════"
echo "  Copia estas variables en tu archivo .env:"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "JWT_PRIVATE_KEY=\"$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' "$PRIVATE_KEY")\""
echo ""
echo "JWT_PUBLIC_KEY=\"$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' "$PUBLIC_KEY")\""
echo ""

# Generar también la clave de cifrado 2FA (64 hex chars = 32 bytes = AES-256)
echo "══════════════════════════════════════════════════════════════════"
echo "  Clave de cifrado para secretos 2FA (AES-256):"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo "TWO_FACTOR_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "⚠️   IMPORTANTE:"
echo "  - Nunca commitees el archivo keys/private.pem al repositorio."
echo "  - El directorio keys/ ya está en .gitignore."
echo "  - En producción, inyectar las claves como variables de entorno,"
echo "    no como archivos en el filesystem del contenedor."
echo "══════════════════════════════════════════════════════════════════"
echo ""
