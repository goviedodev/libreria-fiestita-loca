import { useState, type FormEvent } from "react";
import { CONDICIONES, type Condicion } from "../../../shared/libro";
import type { CamposLibro } from "./campos";

interface Props {
	campos: CamposLibro;
	alCambiar: (campos: CamposLibro) => void;
	alEnviar: () => void | Promise<void>;
	enviando: boolean;
	errores: Record<string, string>;
	etiquetaEnvio: string;
	/** La ingesta por ISBN prellena estos campos; el aviso explica que son editables. */
	prellenado?: string | null;
	children?: React.ReactNode;
}

export function FormularioLibro({
	campos,
	alCambiar,
	alEnviar,
	enviando,
	errores,
	etiquetaEnvio,
	prellenado,
	children,
}: Props) {
	const [tocado, setTocado] = useState(false);

	function cambiar<C extends keyof CamposLibro>(campo: C, valor: CamposLibro[C]) {
		alCambiar({ ...campos, [campo]: valor });
	}

	function manejarEnvio(evento: FormEvent) {
		evento.preventDefault();
		setTocado(true);
		void alEnviar();
	}

	const faltaObligatorio = tocado && (!campos.titulo.trim() || !campos.autor.trim());

	return (
		<form className="inv__form" onSubmit={manejarEnvio} noValidate>
			{prellenado && (
				<p className="inv__aviso inv__aviso--dato" role="status">
					Datos traídos de {prellenado}. Corrige lo que haga falta antes de guardar.
				</p>
			)}

			{children}

			<div className="inv__rejilla">
				<Campo
					etiqueta="Título"
					valor={campos.titulo}
					alCambiar={(v) => cambiar("titulo", v)}
					error={errores.titulo}
					requerido
					ancho="completo"
				/>
				<Campo
					etiqueta="Autor"
					valor={campos.autor}
					alCambiar={(v) => cambiar("autor", v)}
					error={errores.autor}
					requerido
					ancho="completo"
				/>
				<Campo
					etiqueta="ISBN"
					valor={campos.isbn}
					alCambiar={(v) => cambiar("isbn", v)}
					error={errores.isbn}
					ayuda="Opcional. Si no es válido, se guarda vacío."
					inputMode="numeric"
				/>
				<Campo
					etiqueta="Editorial"
					valor={campos.editorial}
					alCambiar={(v) => cambiar("editorial", v)}
					error={errores.editorial}
				/>
				<Campo
					etiqueta="Año"
					valor={campos.anio}
					alCambiar={(v) => cambiar("anio", v)}
					error={errores.anio}
					inputMode="numeric"
				/>
				<Campo
					etiqueta="Género"
					valor={campos.genero}
					alCambiar={(v) => cambiar("genero", v)}
					error={errores.genero}
				/>

				<label className="inv__campo">
					<span className="inv__etiqueta">
						Condición <em>*</em>
					</span>
					<select
						value={campos.condicion}
						onChange={(e) => cambiar("condicion", e.target.value as Condicion)}
					>
						{CONDICIONES.map((condicion) => (
							<option key={condicion} value={condicion}>
								{condicion === "nuevo" ? "Nuevo" : "Usado"}
							</option>
						))}
					</select>
				</label>

				<Campo
					etiqueta="Precio"
					valor={campos.precio}
					alCambiar={(v) => cambiar("precio", v.replace(/[^\d]/g, ""))}
					error={errores.precio}
					ayuda="Pesos, sin puntos ni decimales."
					inputMode="numeric"
					requerido
				/>

				<label className="inv__campo inv__campo--completo">
					<span className="inv__etiqueta">Sinopsis</span>
					<textarea
						rows={4}
						value={campos.sinopsis}
						onChange={(e) => cambiar("sinopsis", e.target.value)}
					/>
					{errores.sinopsis && <span className="inv__error-campo">{errores.sinopsis}</span>}
				</label>
			</div>

			{errores._ && (
				<p className="inv__aviso inv__aviso--error" role="alert">
					{errores._}
				</p>
			)}
			{faltaObligatorio && (
				<p className="inv__aviso inv__aviso--error" role="alert">
					El título y el autor son obligatorios.
				</p>
			)}

			<button type="submit" className="inv__primario" disabled={enviando}>
				{enviando ? "Guardando…" : etiquetaEnvio}
			</button>
		</form>
	);
}

interface CampoProps {
	etiqueta: string;
	valor: string;
	alCambiar: (valor: string) => void;
	error?: string;
	ayuda?: string;
	requerido?: boolean;
	inputMode?: "numeric" | "text";
	ancho?: "completo";
}

function Campo({ etiqueta, valor, alCambiar, error, ayuda, requerido, inputMode, ancho }: CampoProps) {
	return (
		<label className={`inv__campo${ancho === "completo" ? " inv__campo--completo" : ""}`}>
			<span className="inv__etiqueta">
				{etiqueta} {requerido && <em>*</em>}
			</span>
			<input
				type="text"
				value={valor}
				inputMode={inputMode}
				onChange={(e) => alCambiar(e.target.value)}
				aria-invalid={error ? true : undefined}
			/>
			{error ? (
				<span className="inv__error-campo">{error}</span>
			) : (
				ayuda && <span className="inv__ayuda">{ayuda}</span>
			)}
		</label>
	);
}
