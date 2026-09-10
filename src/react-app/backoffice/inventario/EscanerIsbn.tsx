import { useCallback, useEffect, useRef, useState } from "react";
import { esIsbnValido, normalizarIsbn } from "../../../shared/isbn";
import { detectorDisponible, FORMATOS_CODIGO } from "./escaner";

/**
 * Lector del código de barras del libro con la cámara.
 *
 * Usa la API `BarcodeDetector` del navegador, que existe en Chrome Android — el
 * caso de uso real: la dueña con el teléfono y una pila de libros. Donde no
 * exista, este componente no se monta y queda solo el campo manual, que siempre
 * está disponible (design.md §8).
 */

const INTERVALO_MS = 300;

type Estado = "inactivo" | "pidiendo" | "escaneando" | "sin-permiso" | "error";

export function EscanerIsbn({ alDetectar }: { alDetectar: (isbn: string) => void }) {
	const video = useRef<HTMLVideoElement>(null);
	const flujo = useRef<MediaStream | null>(null);
	const [estado, setEstado] = useState<Estado>("inactivo");

	// El padre recrea `alDetectar` en cada render. Si el efecto de abajo dependiera
	// de su identidad, cada render destruiría y recrearía el intervalo, reiniciando
	// la marca de "ya detecté" y releyendo el mismo código una y otra vez. Guardarlo
	// en una ref deja al efecto dependiendo solo del estado que de verdad importa.
	const alDetectarRef = useRef(alDetectar);
	useEffect(() => {
		alDetectarRef.current = alDetectar;
	});

	const detener = useCallback(() => {
		flujo.current?.getTracks().forEach((pista) => pista.stop());
		flujo.current = null;
		if (video.current) video.current.srcObject = null;
	}, []);

	// La cámara es un recurso externo: se libera al desmontar pase lo que pase.
	// Este es exactamente el trabajo para el que sirve un efecto.
	useEffect(() => detener, [detener]);

	async function encender() {
		setEstado("pidiendo");
		try {
			const medios = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
			});
			flujo.current = medios;
			if (video.current) {
				video.current.srcObject = medios;
				await video.current.play();
			}
			setEstado("escaneando");
		} catch (causa) {
			detener();
			// `NotAllowedError` es la dueña diciendo que no; el resto es la cámara
			// fallando. El mensaje cambia, pero en los dos casos queda el campo manual.
			const nombre = causa instanceof DOMException ? causa.name : "";
			setEstado(nombre === "NotAllowedError" || nombre === "SecurityError" ? "sin-permiso" : "error");
		}
	}

	function apagar() {
		detener();
		setEstado("inactivo");
	}

	useEffect(() => {
		if (estado !== "escaneando") return;

		const Detector = detectorDisponible();
		if (!Detector) return;
		const detector = new Detector({ formats: FORMATOS_CODIGO });

		let vigente = true;
		const temporizador = setInterval(async () => {
			const elemento = video.current;
			if (!vigente || !elemento || elemento.readyState < 2) return;
			try {
				const codigos = await detector.detect(elemento);
				const isbn = codigos
					.map((codigo) => normalizarIsbn(codigo.rawValue))
					.find((valor) => esIsbnValido(valor));
				if (isbn && vigente) {
					vigente = false;
					// Un código leído cierra la cámara: ya hizo su trabajo, y dejarla
					// encendida volvería a leer el mismo código en cada fotograma.
					detener();
					setEstado("inactivo");
					alDetectarRef.current(isbn);
				}
			} catch {
				// Un fotograma que no se puede analizar no es un fallo: se prueba el
				// siguiente. Solo un error persistente merecería avisar.
			}
		}, INTERVALO_MS);

		return () => {
			vigente = false;
			clearInterval(temporizador);
		};
	}, [estado, detener]);

	if (estado === "inactivo") {
		return (
			<button type="button" className="inv__escanear" onClick={encender}>
				<span aria-hidden="true">▣</span> Escanear con la cámara
			</button>
		);
	}

	return (
		<div className="inv__escaner">
			<video ref={video} className="inv__video" playsInline muted aria-label="Vista de la cámara" />
			<div className="inv__escaner-pie">
				<p className="inv__escaner-estado" role="status">
					{estado === "pidiendo" && "Pidiendo acceso a la cámara…"}
					{estado === "escaneando" && "Apunta al código de barras de la contratapa."}
					{estado === "sin-permiso" && "Sin acceso a la cámara. Escribe el ISBN a mano."}
					{estado === "error" && "No pudimos abrir la cámara. Escribe el ISBN a mano."}
				</p>
				<button type="button" className="inv__texto-boton" onClick={apagar}>
					Cerrar cámara
				</button>
			</div>
		</div>
	);
}
