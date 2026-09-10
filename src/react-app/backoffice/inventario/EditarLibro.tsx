import { useState } from "react";
import { Link, useLocation } from "wouter";
import type { Libro } from "../../../shared/libro";
import { ErrorRespuesta } from "../../lib/api";
import { Recurso } from "../../lib/Recurso";
import { darDeBaja, editarLibro, obtenerDelInventario, subirFoto } from "./api";
import { aCuerpo, CAMPOS_VACIOS, type CamposLibro } from "./campos";
import { FormularioLibro } from "./FormularioLibro";
import "./inventario.css";

function aCampos(libro: Libro): CamposLibro {
	return {
		...CAMPOS_VACIOS,
		isbn: libro.isbn ?? "",
		titulo: libro.titulo,
		autor: libro.autor,
		editorial: libro.editorial ?? "",
		anio: libro.anio ? String(libro.anio) : "",
		genero: libro.genero ?? "",
		sinopsis: libro.sinopsis ?? "",
		condicion: libro.condicion,
		precio: String(libro.precio),
	};
}

export function EditarLibro({ id }: { id: string }) {
	return (
		<Recurso
			pedir={() => obtenerDelInventario(id)}
			respaldo={<p className="inv__vacio">Cargando libro…</p>}
		>
			{(inicial) => <Editor id={id} inicial={inicial} />}
		</Recurso>
	);
}

function Editor({ id, inicial }: { id: string; inicial: { libro: Libro; bloqueadoPor: string[] } }) {
	const [, navegar] = useLocation();

	const [libro, setLibro] = useState(inicial.libro);
	const [campos, setCampos] = useState(() => aCampos(inicial.libro));
	const [guardando, setGuardando] = useState(false);
	const [errores, setErrores] = useState<Record<string, string>>({});
	const [aviso, setAviso] = useState<string | null>(null);
	const [subiendo, setSubiendo] = useState(false);
	const [confirmandoBaja, setConfirmandoBaja] = useState(false);

	const bloqueadoPor = inicial.bloqueadoPor;

	async function guardar() {
		setGuardando(true);
		setErrores({});
		setAviso(null);
		try {
			const { libro: actualizado } = await editarLibro(id, aCuerpo(campos));
			setLibro(actualizado);
			setCampos(aCampos(actualizado));
			setAviso("Cambios guardados.");
		} catch (causa) {
			if (causa instanceof ErrorRespuesta) {
				setErrores(causa.campos ?? { _: causa.message });
			} else {
				setErrores({ _: "No pudimos guardar los cambios." });
			}
		} finally {
			setGuardando(false);
		}
	}

	async function adjuntar(archivo: File | undefined) {
		if (!archivo) return;
		setSubiendo(true);
		setErrores({});
		try {
			const { libro: conFoto } = await subirFoto(id, archivo);
			setLibro(conFoto);
			setAviso("Foto actualizada.");
		} catch (causa) {
			setErrores({ _: causa instanceof ErrorRespuesta ? causa.message : "No pudimos subir la imagen." });
		} finally {
			setSubiendo(false);
		}
	}

	async function confirmarBaja() {
		setErrores({});
		try {
			await darDeBaja(id);
			navegar("/inventario");
		} catch (causa) {
			setConfirmandoBaja(false);
			setErrores({
				_: causa instanceof ErrorRespuesta ? causa.message : "No pudimos dar de baja el libro.",
			});
		}
	}

	return (
		<section className="inv">
			<header className="inv__cabecera">
				<div>
					<h1>{libro.titulo}</h1>
					<p className="inv__bajada">
						{libro.autor} · {libro.dadoDeBaja ? "Dado de baja" : libro.estado}
					</p>
				</div>
				<Link href="/inventario" className="inv__texto-boton">
					Volver al inventario
				</Link>
			</header>

			{aviso && (
				<p className="inv__aviso inv__aviso--exito" role="status">
					{aviso}
				</p>
			)}

			<div className="inv__imagen-actual">
				{libro.imagenUrl ? (
					<img src={libro.imagenUrl} alt="" width={110} />
				) : (
					<span className="inv__miniatura inv__miniatura--vacia" aria-hidden="true">
						◲
					</span>
				)}
				<label className="inv__texto-boton inv__texto-boton--archivo">
					{subiendo ? "Subiendo…" : libro.imagenUrl ? "Reemplazar foto" : "Adjuntar foto"}
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						disabled={subiendo}
						onChange={(e) => void adjuntar(e.target.files?.[0])}
					/>
				</label>
			</div>

			<FormularioLibro
				campos={campos}
				alCambiar={setCampos}
				alEnviar={guardar}
				enviando={guardando}
				errores={errores}
				etiquetaEnvio="Guardar cambios"
			/>

			<div className="inv__zona-baja">
				<h2>Dar de baja</h2>
				{bloqueadoPor.length > 0 ? (
					<p className="inv__aviso inv__aviso--atencion">
						No se puede dar de baja: el libro está en la reserva {bloqueadoPor.join(", ")}. Puedes
						editarlo igual.
					</p>
				) : libro.dadoDeBaja ? (
					<p className="inv__ayuda">
						Este libro ya está dado de baja: no aparece en el catálogo, pero se conserva para las
						reservas que lo incluyan.
					</p>
				) : confirmandoBaja ? (
					<div className="inv__confirmar">
						<p>Dejará de aparecer en el catálogo. ¿Confirmas?</p>
						<button type="button" className="inv__peligro" onClick={() => void confirmarBaja()}>
							Sí, dar de baja
						</button>
						<button
							type="button"
							className="inv__texto-boton"
							onClick={() => setConfirmandoBaja(false)}
						>
							Cancelar
						</button>
					</div>
				) : (
					<button type="button" className="inv__peligro" onClick={() => setConfirmandoBaja(true)}>
						Dar de baja
					</button>
				)}
			</div>
		</section>
	);
}
