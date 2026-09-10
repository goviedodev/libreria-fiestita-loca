import { useRef, useState } from "react";
import { Link } from "wouter";
import { esIsbnValido, normalizarIsbn } from "../../../shared/isbn";
import type { Libro } from "../../../shared/libro";
import { formatearPrecio } from "../../../shared/texto";
import { ErrorRespuesta } from "../../lib/api";
import { buscarIsbn, crearLibro, NOMBRE_FUENTE, subirFoto, type MetadatosIsbn } from "./api";
import { EscanerIsbn } from "./EscanerIsbn";
import { hayEscaner } from "./escaner";
import { aCuerpo, CAMPOS_VACIOS, type CamposLibro } from "./campos";
import { FormularioLibro } from "./FormularioLibro";
import "./inventario.css";

/**
 * Ingesta de un libro.
 *
 * El camino corto es escanear o teclear el ISBN, revisar lo que llegó y poner
 * precio y condición. Cuando el libro no tiene ISBN o las fuentes no lo conocen,
 * el mismo formulario sirve para el alta manual: nunca se llega a un callejón sin
 * salida donde haya que empezar de nuevo.
 */
export function Ingesta() {
	const [isbn, setIsbn] = useState("");
	const [buscando, setBuscando] = useState(false);
	const [avisoIsbn, setAvisoIsbn] = useState<string | null>(null);
	const [fuente, setFuente] = useState<string | null>(null);
	const [ejemplares, setEjemplares] = useState(0);
	const [portadaUrl, setPortadaUrl] = useState<string | null>(null);
	const [portadaPrevia, setPortadaPrevia] = useState<string | null>(null);

	const [campos, setCampos] = useState<CamposLibro>(CAMPOS_VACIOS);
	const [abierto, setAbierto] = useState(false);
	const [guardando, setGuardando] = useState(false);
	const [errores, setErrores] = useState<Record<string, string>>({});
	const [creado, setCreado] = useState<Libro | null>(null);

	const busquedaEnCurso = useRef<AbortController | null>(null);

	function limpiar() {
		setCampos(CAMPOS_VACIOS);
		setIsbn("");
		setAvisoIsbn(null);
		setFuente(null);
		setEjemplares(0);
		setPortadaUrl(null);
		setPortadaPrevia(null);
		setErrores({});
		setCreado(null);
		setAbierto(false);
	}

	function prellenar(metadatos: MetadatosIsbn) {
		setCampos({
			...CAMPOS_VACIOS,
			isbn: metadatos.isbn,
			titulo: metadatos.titulo ?? "",
			autor: metadatos.autor ?? "",
			editorial: metadatos.editorial ?? "",
			anio: metadatos.anio ? String(metadatos.anio) : "",
			genero: metadatos.genero ?? "",
			sinopsis: metadatos.sinopsis ?? "",
		});
		setPortadaUrl(metadatos.portadaUrl);
		setPortadaPrevia(metadatos.portadaUrl);
		setFuente(NOMBRE_FUENTE[metadatos.fuente]);
	}

	async function buscar(valor: string) {
		const limpio = normalizarIsbn(valor);
		setIsbn(limpio);
		setCreado(null);

		if (!esIsbnValido(limpio)) {
			setAvisoIsbn("Ese ISBN no es válido. Revísalo o ingresa el libro a mano.");
			return;
		}

		busquedaEnCurso.current?.abort();
		const control = new AbortController();
		busquedaEnCurso.current = control;

		setBuscando(true);
		setAvisoIsbn(null);
		try {
			const resultado = await buscarIsbn(limpio, control.signal);
			setEjemplares(resultado.ejemplares);

			if (resultado.encontrado) {
				prellenar(resultado.metadatos);
				setAbierto(true);
			} else {
				// Sin coincidencias no se pierde nada: el ISBN queda puesto y el
				// formulario se abre para completarlo a mano.
				setCampos((previos) => ({ ...previos, isbn: limpio }));
				setFuente(null);
				setAvisoIsbn("Ninguna fuente conoce ese ISBN. Completa los datos a mano.");
				setAbierto(true);
			}
		} catch (causa) {
			if (control.signal.aborted) return;
			// El formulario se abre igual y conserva lo que ya estuviera escrito: la
			// spec pide no perder el trabajo del dueño cuando las fuentes fallan.
			setCampos((previos) => ({ ...previos, isbn: limpio }));
			setAvisoIsbn(
				causa instanceof ErrorRespuesta
					? causa.message
					: "No pudimos consultar las fuentes. Completa los datos a mano.",
			);
			setAbierto(true);
		} finally {
			setBuscando(false);
		}
	}

	async function guardar() {
		setGuardando(true);
		setErrores({});
		try {
			const { libro } = await crearLibro({ ...aCuerpo(campos), portadaUrl });
			setCreado(libro);
			setAbierto(false);
		} catch (causa) {
			if (causa instanceof ErrorRespuesta) {
				setErrores(causa.campos ?? { _: causa.message });
			} else {
				setErrores({ _: "No pudimos guardar el libro. Inténtalo de nuevo." });
			}
		} finally {
			setGuardando(false);
		}
	}

	return (
		<section className="inv">
			<header className="inv__cabecera">
				<div>
					<h1>Ingresar libro</h1>
					<p className="inv__bajada">
						Escanea el código de barras o escribe el ISBN. Si el libro no tiene ISBN, ingrésalo a
						mano.
					</p>
				</div>
				<Link href="/inventario" className="inv__texto-boton">
					Ver inventario
				</Link>
			</header>

			<div className="inv__buscador">
				<label className="inv__campo inv__campo--isbn">
					<span className="inv__etiqueta">ISBN</span>
					<input
						type="text"
						value={isbn}
						inputMode="numeric"
						placeholder="978…"
						autoFocus
						onChange={(e) => setIsbn(normalizarIsbn(e.target.value))}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void buscar(isbn);
							}
						}}
					/>
				</label>
				<button
					type="button"
					className="inv__primario"
					onClick={() => void buscar(isbn)}
					disabled={buscando || isbn.length === 0}
				>
					{buscando ? "Buscando…" : "Buscar datos"}
				</button>
				<button
					type="button"
					className="inv__texto-boton"
					onClick={() => {
						limpiar();
						setAbierto(true);
					}}
				>
					Ingresar sin ISBN
				</button>
			</div>

			{hayEscaner() && <EscanerIsbn alDetectar={(codigo) => void buscar(codigo)} />}

			{avisoIsbn && (
				<p className="inv__aviso inv__aviso--atencion" role="status">
					{avisoIsbn}
				</p>
			)}

			{ejemplares > 0 && (
				<p className="inv__aviso inv__aviso--atencion" role="status">
					Ya tienes {ejemplares === 1 ? "un ejemplar" : `${ejemplares} ejemplares`} con ese ISBN.
					Puedes registrar este igual como ejemplar aparte.
				</p>
			)}

			{creado && <RecienCreado libro={creado} alSeguir={limpiar} />}

			{abierto && (
				<FormularioLibro
					campos={campos}
					alCambiar={setCampos}
					alEnviar={guardar}
					enviando={guardando}
					errores={errores}
					etiquetaEnvio="Guardar libro"
					prellenado={fuente}
				>
					{portadaPrevia && (
						<div className="inv__portada">
							<img src={portadaPrevia} alt="" width={90} />
							<div>
								<p className="inv__portada-titulo">Portada encontrada</p>
								<p className="inv__ayuda">
									Se guardará una copia propia. Después puedes reemplazarla con una foto del
									ejemplar real.
								</p>
								<button
									type="button"
									className="inv__texto-boton"
									onClick={() => {
										setPortadaUrl(null);
										setPortadaPrevia(null);
									}}
								>
									No usar esta portada
								</button>
							</div>
						</div>
					)}
				</FormularioLibro>
			)}
		</section>
	);
}

/**
 * Confirmación del alta con el paso siguiente natural: la foto del ejemplar.
 *
 * Se ofrece aquí y no en el formulario porque hasta que el libro no existe no hay
 * a qué asociarla.
 */
function RecienCreado({ libro, alSeguir }: { libro: Libro; alSeguir: () => void }) {
	const [actual, setActual] = useState(libro);
	const [subiendo, setSubiendo] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function adjuntar(archivo: File | undefined) {
		if (!archivo) return;
		setSubiendo(true);
		setError(null);
		try {
			const { libro: conFoto } = await subirFoto(actual.id, archivo);
			setActual(conFoto);
		} catch (causa) {
			setError(causa instanceof ErrorRespuesta ? causa.message : "No pudimos subir la imagen.");
		} finally {
			setSubiendo(false);
		}
	}

	return (
		<div className="inv__creado">
			<div className="inv__creado-datos">
				<p className="inv__aviso inv__aviso--exito" role="status">
					Guardado: <strong>{actual.titulo}</strong> — {formatearPrecio(actual.precio)}
				</p>
				<div className="inv__creado-acciones">
					<label className="inv__texto-boton inv__texto-boton--archivo">
						{subiendo ? "Subiendo…" : "Adjuntar foto del ejemplar"}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp"
							disabled={subiendo}
							onChange={(e) => void adjuntar(e.target.files?.[0])}
						/>
					</label>
					<Link href={`/inventario/${actual.id}`} className="inv__texto-boton">
						Editar
					</Link>
					<button type="button" className="inv__primario" onClick={alSeguir}>
						Ingresar otro
					</button>
				</div>
				{error && (
					<p className="inv__aviso inv__aviso--error" role="alert">
						{error}
					</p>
				)}
			</div>
			{actual.imagenUrl && <img className="inv__creado-imagen" src={actual.imagenUrl} alt="" />}
		</div>
	);
}
