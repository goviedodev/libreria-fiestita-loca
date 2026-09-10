import { useState, type FormEvent } from "react";
import { CONDICIONES } from "../../shared/libro";
import { ORDENES, type FiltrosCatalogo } from "./api";

interface Props {
	filtros: FiltrosCatalogo;
	generos: readonly string[];
	total: number;
	hayAlgoQueLimpiar: boolean;
	alAplicar: (filtros: FiltrosCatalogo) => void;
}

/**
 * Búsqueda, filtros y orden.
 *
 * El texto se envía al confirmar y no en cada tecla: cada consulta va a la base y
 * además reescribe la URL, así que teclear "borges" no debe dejar seis entradas en
 * el historial del navegador. Los selectores sí aplican al instante, porque ahí un
 * cambio es una decisión completa.
 */
export function Filtros({ filtros, generos, total, hayAlgoQueLimpiar, alAplicar }: Props) {
	const [texto, setTexto] = useState(filtros.q ?? "");

	function cambiar(parcial: Partial<FiltrosCatalogo>) {
		// Cualquier cambio de filtro vuelve a la primera página: quedarse en la 3 de
		// un resultado que ahora tiene una sola página deja la pantalla vacía.
		alAplicar({ ...filtros, ...parcial, pagina: undefined });
	}

	function buscar(evento: FormEvent) {
		evento.preventDefault();
		cambiar({ q: texto.trim() || undefined });
	}

	return (
		<form className="filtros" onSubmit={buscar} role="search">
			<div className="filtros__busqueda">
				<label className="filtros__campo filtros__campo--texto">
					<span className="filtros__etiqueta">Buscar</span>
					<input
						type="search"
						value={texto}
						placeholder="Título, autor o ISBN"
						onChange={(e) => setTexto(e.target.value)}
					/>
				</label>
				<button type="submit" className="filtros__boton">
					Buscar
				</button>
			</div>

			<div className="filtros__linea">
				<label className="filtros__campo">
					<span className="filtros__etiqueta">Género</span>
					<select value={filtros.genero ?? ""} onChange={(e) => cambiar({ genero: e.target.value || undefined })}>
						<option value="">Todos</option>
						{generos.map((genero) => (
							<option key={genero} value={genero}>
								{genero}
							</option>
						))}
					</select>
				</label>

				<label className="filtros__campo">
					<span className="filtros__etiqueta">Condición</span>
					<select
						value={filtros.condicion ?? ""}
						onChange={(e) => cambiar({ condicion: e.target.value || undefined })}
					>
						<option value="">Todas</option>
						{CONDICIONES.map((condicion) => (
							<option key={condicion} value={condicion}>
								{condicion === "nuevo" ? "Nuevo" : "Usado"}
							</option>
						))}
					</select>
				</label>

				<label className="filtros__campo">
					<span className="filtros__etiqueta">Disponibilidad</span>
					<select
						value={filtros.disponibilidad ?? ""}
						onChange={(e) => cambiar({ disponibilidad: e.target.value || undefined })}
					>
						<option value="">Todos</option>
						<option value="disponible">Solo disponibles</option>
					</select>
				</label>

				<label className="filtros__campo">
					<span className="filtros__etiqueta">Orden</span>
					<select value={filtros.orden ?? "recientes"} onChange={(e) => cambiar({ orden: e.target.value })}>
						{ORDENES.map((orden) => (
							<option key={orden.valor} value={orden.valor}>
								{orden.etiqueta}
							</option>
						))}
					</select>
				</label>
			</div>

			<div className="filtros__resumen">
				<p className="filtros__total" role="status">
					{total === 0 ? "Sin resultados" : `${total} ${total === 1 ? "libro" : "libros"}`}
				</p>
				{hayAlgoQueLimpiar && (
					<button
						type="button"
						className="filtros__limpiar"
						onClick={() => {
							setTexto("");
							alAplicar({});
						}}
					>
						Limpiar filtros
					</button>
				)}
			</div>
		</form>
	);
}
