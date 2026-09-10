import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { LibroPublico } from "../../shared/libro";
import { esTelefonoValido, MENSAJE_TELEFONO } from "../../shared/telefono";
import { formatearPrecio } from "../../shared/texto";
import { ErrorRespuesta } from "../lib/api";
import { Recurso } from "../lib/Recurso";
import { crearReserva, releerSeleccion, type ReservaCreada } from "./api";
import { quitar, totalDe, vaciar } from "./seleccion";
import { useSeleccion } from "./useSeleccion";
import "./reserva.css";

/**
 * Armado y envío de la reserva.
 *
 * Los libros se releen del servidor al entrar: entre que el visitante los eligió
 * y llegó aquí, otro cliente pudo haberse llevado alguno. La spec pide avisarle
 * cuál y dejarlo continuar con el resto, no borrarle la selección entera.
 */
export function Reserva() {
	const seleccion = useSeleccion();
	const [creada, setCreada] = useState<ReservaCreada | null>(null);

	// La confirmación se comprueba ANTES que la selección y vive por encima de
	// ella. Crear la reserva vacía la selección, y si el folio se guardara dentro
	// del formulario, ese mismo vaciado desmontaría la pantalla que muestra el
	// folio y el enlace de WhatsApp: el cliente perdería justo lo que vino a
	// buscar, con la reserva ya creada en el servidor.
	if (creada) {
		return <Confirmacion creada={creada} />;
	}

	if (seleccion.length === 0) {
		return <SinLibros />;
	}

	return (
		<Recurso
			// La clave rehace la consulta cuando el visitante quita un libro.
			key={seleccion.join(",")}
			pedir={() => releerSeleccion(seleccion)}
			respaldo={<p className="reserva__cargando">Revisando tu selección…</p>}
		>
			{(libros) => <Formulario ids={seleccion} libros={libros} alCrear={setCreada} />}
		</Recurso>
	);
}

function SinLibros() {
	return (
		<section className="reserva">
			<h1 className="reserva__titulo">Tu reserva está vacía</h1>
			<p className="reserva__entrada">
				Recorre el catálogo y agrega los ejemplares que quieras apartar. Después nos dejas tu nombre y
				te llevamos a WhatsApp con el pedido escrito.
			</p>
			<Link href="/" className="reserva__enviar">
				Ver el catálogo
			</Link>
		</section>
	);
}

interface PropsFormulario {
	ids: readonly string[];
	libros: readonly (LibroPublico | null)[];
	alCrear: (creada: ReservaCreada) => void;
}

function Formulario({ ids, libros, alCrear }: PropsFormulario) {
	const [nombre, setNombre] = useState("");
	const [telefono, setTelefono] = useState("");
	const [nota, setNota] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [errores, setErrores] = useState<Record<string, string>>({});

	// Cada id se empareja con lo que devolvió el servidor. Un `null` es un libro que
	// ya no existe o fue retirado; los demás traen su estado real de ahora.
	const filas = ids.map((id, indice) => ({ id, libro: libros[indice] }));
	const disponibles = filas.filter((fila) => fila.libro?.estado === "disponible");
	const noDisponibles = filas.filter((fila) => fila.libro?.estado !== "disponible");
	const total = totalDe(disponibles.map((fila) => fila.libro as LibroPublico));

	async function enviar(evento: FormEvent) {
		evento.preventDefault();

		// Se valida antes de salir a la red para dar el error en el campo mismo; el
		// Worker vuelve a validar igual, porque el cliente no es control de nada.
		const locales: Record<string, string> = {};
		if (nombre.trim().length < 2) locales.nombre = "Necesitamos tu nombre";
		if (!esTelefonoValido(telefono)) locales.telefono = MENSAJE_TELEFONO;
		if (Object.keys(locales).length > 0) {
			setErrores(locales);
			return;
		}

		setEnviando(true);
		setErrores({});
		try {
			const respuesta = await crearReserva({
				nombre: nombre.trim(),
				telefono: telefono.trim(),
				nota: nota.trim() || null,
				libroIds: disponibles.map((fila) => fila.id),
			});
			// El orden importa: primero se entrega la confirmación al componente de
			// arriba, después se vacía la selección. Al revés, el vaciado desmontaría
			// este formulario antes de que nadie se quede con el folio.
			alCrear(respuesta);
			// La selección se vacía recién cuando la reserva existe en el servidor: si
			// el envío falla, el visitante conserva sus libros.
			vaciar();
		} catch (causa) {
			if (causa instanceof ErrorRespuesta) {
				setErrores(causa.campos ?? { _: causa.message });
			} else {
				setErrores({ _: "No pudimos crear tu reserva. Revisa tu conexión e inténtalo de nuevo." });
			}
		} finally {
			setEnviando(false);
		}
	}

	return (
		<section className="reserva">
			<h1 className="reserva__titulo">Mi reserva</h1>
			<p className="reserva__entrada">
				Déjanos tu nombre y tu celular. Te llevamos a WhatsApp con el pedido ya escrito; el ejemplar
				queda apartado desde ahora.
			</p>

			{noDisponibles.length > 0 && (
				<div className="reserva__aviso reserva__aviso--atencion" role="alert">
					<p>
						{noDisponibles.length === 1
							? "Un libro de tu selección ya no está disponible:"
							: "Algunos libros de tu selección ya no están disponibles:"}
					</p>
					<ul>
						{noDisponibles.map((fila) => (
							<li key={fila.id}>
								{fila.libro ? `«${fila.libro.titulo}»` : "Un libro que fue retirado del catálogo"}{" "}
								<button type="button" className="reserva__quitar" onClick={() => quitar(fila.id)}>
									Quitar
								</button>
							</li>
						))}
					</ul>
					<p className="reserva__aviso-ayuda">Puedes quitarlos y seguir con el resto.</p>
				</div>
			)}

			<ul className="reserva__lista">
				{disponibles.map(({ id, libro }) => (
					<li key={id} className="reserva__item">
						{libro?.imagenUrl ? (
							<img className="reserva__miniatura" src={libro.imagenUrl} alt="" loading="lazy" />
						) : (
							<span className="reserva__miniatura reserva__miniatura--vacia" aria-hidden="true">
								FL
							</span>
						)}
						<span className="reserva__item-datos">
							<Link href={`/libro/${id}`} className="reserva__item-titulo">
								{libro?.titulo}
							</Link>
							<span className="reserva__item-autor">{libro?.autor}</span>
						</span>
						<span className="reserva__item-precio">{formatearPrecio(libro?.precio ?? 0)}</span>
						<button type="button" className="reserva__quitar" onClick={() => quitar(id)}>
							Quitar
						</button>
					</li>
				))}
			</ul>

			{disponibles.length === 0 ? (
				<p className="reserva__entrada">
					No queda ningún libro disponible en tu selección. <Link href="/">Vuelve al catálogo</Link> a
					elegir otros.
				</p>
			) : (
				<>
					<p className="reserva__total">
						<span>Total</span>
						<strong>{formatearPrecio(total)}</strong>
					</p>

					<form className="reserva__form" onSubmit={enviar} noValidate>
						<label className="reserva__campo">
							<span className="reserva__etiqueta">Tu nombre</span>
							<input
								type="text"
								value={nombre}
								autoComplete="name"
								onChange={(e) => setNombre(e.target.value)}
								aria-invalid={errores.nombre ? true : undefined}
							/>
							{errores.nombre && <span className="reserva__error-campo">{errores.nombre}</span>}
						</label>

						<label className="reserva__campo">
							<span className="reserva__etiqueta">Tu celular</span>
							<input
								type="tel"
								value={telefono}
								placeholder="+56 9 1234 5678"
								autoComplete="tel"
								inputMode="tel"
								onChange={(e) => setTelefono(e.target.value)}
								aria-invalid={errores.telefono ? true : undefined}
							/>
							{errores.telefono ? (
								<span className="reserva__error-campo">{errores.telefono}</span>
							) : (
								<span className="reserva__ayuda">Es el número por el que te escribimos.</span>
							)}
						</label>

						<label className="reserva__campo reserva__campo--completo">
							<span className="reserva__etiqueta">Nota (opcional)</span>
							<textarea
								rows={3}
								value={nota}
								placeholder="Cuándo pasas a buscarlo, alguna consulta…"
								onChange={(e) => setNota(e.target.value)}
							/>
						</label>

						{errores._ && (
							<p className="reserva__aviso reserva__aviso--error" role="alert">
								{errores._}
							</p>
						)}

						<button type="submit" className="reserva__enviar" disabled={enviando}>
							{enviando ? "Creando tu reserva…" : "Reservar y abrir WhatsApp"}
						</button>
					</form>
				</>
			)}
		</section>
	);
}

/**
 * Confirmación y handoff.
 *
 * El enlace de WhatsApp se ofrece como enlace y no como redirección automática: si
 * el navegador bloquea la apertura, o el cliente cierra WhatsApp sin enviar, la
 * reserva ya está registrada y el folio queda a la vista para consultarla después.
 */
function Confirmacion({ creada }: { creada: ReservaCreada }) {
	const { reserva, whatsapp } = creada;

	return (
		<section className="reserva">
			<p className="reserva__antetitulo">Reserva creada</p>
			<h1 className="reserva__titulo">
				Tu folio es <span className="reserva__folio">{reserva.folio}</span>
			</h1>
			<p className="reserva__entrada">
				Anótalo: con ese código puedes consultar el estado de tu reserva cuando quieras. Los
				ejemplares quedaron apartados a tu nombre.
			</p>

			<a className="reserva__enviar reserva__enviar--whatsapp" href={whatsapp} target="_blank" rel="noreferrer">
				Abrir WhatsApp con mi pedido
			</a>

			<ul className="reserva__lista reserva__lista--resumen">
				{reserva.items.map((item) => (
					<li key={item.libro.id} className="reserva__item">
						<span className="reserva__item-datos">
							<Link href={`/libro/${item.libro.id}`} className="reserva__item-titulo">
								{item.libro.titulo}
							</Link>
							<span className="reserva__item-autor">{item.libro.autor}</span>
						</span>
						<span className="reserva__item-precio">{formatearPrecio(item.precio)}</span>
					</li>
				))}
			</ul>

			<p className="reserva__total">
				<span>Total</span>
				<strong>{formatearPrecio(reserva.total)}</strong>
			</p>

			<p className="reserva__pie-enlaces">
				<Link href={`/reserva/${reserva.folio}`}>Ver el estado de mi reserva</Link>
				{" · "}
				<Link href="/">Seguir mirando el catálogo</Link>
			</p>
		</section>
	);
}
