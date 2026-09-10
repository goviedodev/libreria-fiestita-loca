import { useState, type FormEvent } from "react";
import { enviar, ErrorRespuesta } from "../lib/api";

/**
 * Pantalla de ingreso al backoffice.
 *
 * El token viaja al servidor y vuelve como cookie HttpOnly: nunca se guarda en el
 * navegador desde aquí.
 */
export function Ingreso({ alEntrar }: { alEntrar: () => void }) {
	const [token, setToken] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	async function manejarEnvio(evento: FormEvent) {
		evento.preventDefault();
		setEnviando(true);
		setError(null);
		try {
			await enviar("/api/auth/ingreso", { token });
			setToken("");
			alEntrar();
		} catch (causa) {
			setError(
				causa instanceof ErrorRespuesta ? causa.message : "No pudimos conectar con el servidor",
			);
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="ingreso">
			<form className="ingreso__caja" onSubmit={manejarEnvio}>
				<p className="ingreso__marca">Fiestita Loca</p>
				<h1 className="ingreso__titulo">Backoffice</h1>
				<p className="ingreso__ayuda">Ingresa el token de acceso para administrar la librería.</p>

				<label className="ingreso__campo">
					<span>Token de acceso</span>
					<input
						type="password"
						name="token"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						autoComplete="current-password"
						autoFocus
						required
					/>
				</label>

				{error && (
					<p className="ingreso__error" role="alert">
						{error}
					</p>
				)}

				<button type="submit" className="ingreso__boton" disabled={enviando || token.length === 0}>
					{enviando ? "Comprobando…" : "Entrar"}
				</button>
			</form>
		</div>
	);
}
