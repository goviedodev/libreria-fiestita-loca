#!/usr/bin/env bash
#
# run.sh — levanta Librería Fiestita Loca en localhost.
#
# Deja el entorno listo antes de arrancar: dependencias, secrets locales y
# migraciones de D1. Cada paso se salta solo si no corresponde todavía, así que
# el script sirve tanto ahora como cuando existan los bindings.
#
#   ./run.sh                 instala si hace falta, migra y levanta el dev server
#   ./run.sh -p 3000         levanta en otro puerto
#   ./run.sh --check         corre lint + tsc + build + deploy --dry-run, sin servidor
#   ./run.sh --fresh         reinstala dependencias y ofrece resetear la D1 local
#   ./run.sh -h              ayuda

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PUERTO="5173"
MODO="dev"
FRESH="no"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
paso()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

uso() {
	sed -n '3,/^[^#]/p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//'
	exit 0
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-p|--port)  PUERTO="${2:?falta el número de puerto}"; shift 2 ;;
		--check)    MODO="check"; shift ;;
		--fresh)    FRESH="si"; shift ;;
		-h|--help)  uso ;;
		*)          rojo "Opción desconocida: $1"; echo; uso ;;
	esac
done

# ---------------------------------------------------------------- requisitos

if ! command -v node >/dev/null 2>&1; then
	rojo "Node no está instalado o no está en el PATH."
	exit 1
fi

NODE_MAYOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAYOR < 20 )); then
	rojo "Se requiere Node 20 o superior (tienes $(node -v))."
	exit 1
fi

# ------------------------------------------------------------- dependencias

if [[ "$FRESH" == "si" ]]; then
	paso "Reinstalando dependencias desde cero"
	rm -rf node_modules
fi

if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules ]]; then
	paso "Instalando dependencias"
	if [[ -f package-lock.json ]]; then
		npm ci
	else
		npm install
	fi
else
	gris "Dependencias al día."
fi

# --------------------------------------------------------- secrets locales

# .dev.vars alimenta las variables del Worker en desarrollo. Está en .gitignore;
# .dev.vars.example sí se versiona y documenta qué variables hacen falta.
if [[ ! -f .dev.vars.example ]]; then
	cat > .dev.vars.example <<'EOF'
# Copia este archivo a .dev.vars para desarrollo local.
# En producción estos valores se cargan con `npx wrangler secret put <NOMBRE>`.

# Token de acceso al backoffice.
ADMIN_TOKEN="cambiame-en-local"

# Secreto con el que se firma la cookie de sesión del backoffice.
SESSION_SECRET="generado-automaticamente-por-run.sh"

# Número de WhatsApp del negocio, formato internacional sin + ni espacios.
WHATSAPP_NUMERO="56900000000"
EOF
	gris "Creado .dev.vars.example"
fi

if [[ ! -f .dev.vars ]]; then
	paso "Creando .dev.vars para desarrollo local"
	SECRETO="$(node -p 'require("crypto").randomBytes(32).toString("hex")')"
	cat > .dev.vars <<EOF
ADMIN_TOKEN="fiestita-local"
SESSION_SECRET="${SECRETO}"
WHATSAPP_NUMERO="56900000000"
EOF
	verde "  .dev.vars listo — token del backoffice en local: fiestita-local"
	gris  "  Estos valores son solo para localhost; producción usa wrangler secret put."
fi

# ------------------------------------------------------------- base de datos

# El binding de D1 y las migraciones aparecen recién con el cambio
# add-plataforma-fiestita-loca. Mientras no existan, este bloque no hace nada.
D1_NOMBRE="$(node -e '
	try {
		const cfg = JSON.parse(require("fs").readFileSync("wrangler.json", "utf8"));
		const db = (cfg.d1_databases || [])[0];
		if (db && db.database_name) process.stdout.write(db.database_name);
	} catch {}
' 2>/dev/null || true)"

if [[ -n "$D1_NOMBRE" && -d migrations ]]; then
	if [[ "$FRESH" == "si" && -d .wrangler/state ]]; then
		rojo "--fresh borra la base D1 local (.wrangler/state) y sus datos de prueba."
		read -r -p "¿Continuar? [s/N] " respuesta
		if [[ "$respuesta" =~ ^[sS]$ ]]; then
			rm -rf .wrangler/state
			verde "  Estado local borrado."
		else
			gris "  Se conserva la base local."
		fi
	fi

	paso "Aplicando migraciones de D1 en local ($D1_NOMBRE)"
	npx wrangler d1 migrations apply "$D1_NOMBRE" --local
elif [[ -n "$D1_NOMBRE" ]]; then
	gris "Binding D1 '$D1_NOMBRE' configurado, pero aún no hay carpeta migrations/."
else
	gris "Sin binding D1 en wrangler.json todavía — se omiten las migraciones."
fi

# ------------------------------------------------------------------ arranque

if [[ "$MODO" == "check" ]]; then
	paso "Lint"
	npm run lint
	paso "Compilación y build"
	npm run build
	paso "Validación del despliegue (dry-run)"
	npx wrangler deploy --dry-run
	echo
	verde "✓ Todo en verde."
	exit 0
fi

echo
verde "Levantando el dev server en el puerto ${PUERTO}"
gris  "  Vite imprime la URL definitiva abajo; si ${PUERTO} está ocupado usa el siguiente libre."
gris  "  El catálogo cuelga de / y la API del Worker de /api/."
gris  "  Ctrl+C para detener."
echo

exec npm run dev -- --port "$PUERTO"
