import { useState, type FormEvent } from "react";
import { esTelefonoValido, MENSAJE_TELEFONO } from "../../shared/telefono";
import { enviar, ErrorRespuesta } from "../lib/api";

interface Respuesta {
	registrada: boolean;
	yaExistia: boolean;
}

/**
 * Formulario de aviso tras una búsqueda sin resultados.
 *
 * Es el momento exacto en que el visitante iba a irse con las manos vacías: se le
 * ofrece dejar anotado lo que buscaba. El término de la búsqueda viene prellenado
 * para que solo tenga que poner su teléfono.
 */
export function AvisameSiLlega({ termino }: { termino?: string }) {
	const [buscado, setBuscado] = useState(termino ?? "");
	const [telefono, setTelefono] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [errores, setErrores] = useState<Record<string, string>>({});
	const [resultado, setResultado] = useState<Respuesta | null>(null);

	if (resultado) {
		return (
			<p className="avisame__hecho" role="status">
				{resultado.yaExistia
					? "Ya teníamos anotado tu pedido. Te escribimos apenas llegue."
					: "Listo, quedó anotado. Te escribimos por WhatsApp apenas llegue."}
			</p>
		);
	}

	async function registrar(evento: FormEvent) {
		evento.preventDefault();

		const locales: Record<string, string> = {};
		if (!buscado.trim()) locales.titulo = "Dinos qué libro o autor buscas";
		if (!esTelefonoValido(telefono)) locales.telefono = MENSAJE_TELEFONO;
		if (Object.keys(locales).length > 0) {
			setErrores(locales);
			return;
		}

		setEnviando(true);
		setErrores({});
		try {
			// Se manda como título: el visitante escribe en una sola caja y puede ser
			// cualquiera de los dos. El cruce con el inventario mira ambos campos.
			setResultado(
				await enviar<Respuesta>("/api/solicitudes", {
					titulo: buscado.trim(),
					autor: null,
					telefono: telefono.trim(),
				}),
			);
		} catch (causa) {
			setErrores(
				causa instanceof ErrorRespuesta
					? (causa.campos ?? { _: causa.message })
					: { _: "No pudimos anotar tu pedido. Inténtalo de nuevo." },
			);
		} finally {
			setEnviando(false);
		}
	}

	return (
		<form className="avisame" onSubmit={registrar} noValidate>
			<h2 className="avisame__titulo">¿Te avisamos cuando llegue?</h2>
			<p className="avisame__entrada">
				Déjanos qué buscabas y tu celular. Te escribimos por WhatsApp si aparece; no mandamos nada
				más.
			</p>

			<div className="avisame__campos">
				<label className="avisame__campo">
					<span className="avisame__etiqueta">Libro o autor</span>
					<input
						type="text"
						value={buscado}
						placeholder="Título o autor"
						onChange={(e) => setBuscado(e.target.value)}
						aria-invalid={errores.titulo ? true : undefined}
					/>
					{errores.titulo && <span className="avisame__error">{errores.titulo}</span>}
				</label>

				<label className="avisame__campo">
					<span className="avisame__etiqueta">Tu celular</span>
					<input
						type="tel"
						value={telefono}
						placeholder="+56 9 1234 5678"
						autoComplete="tel"
						inputMode="tel"
						onChange={(e) => setTelefono(e.target.value)}
						aria-invalid={errores.telefono ? true : undefined}
					/>
					{errores.telefono && <span className="avisame__error">{errores.telefono}</span>}
				</label>

				<button type="submit" className="avisame__boton" disabled={enviando}>
					{enviando ? "Anotando…" : "Avísame"}
				</button>
			</div>

			{errores._ && (
				<p className="avisame__error" role="alert">
					{errores._}
				</p>
			)}
		</form>
	);
}
