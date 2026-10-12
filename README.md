# Dysto
Prototipo jugable de simulación distópica, construido como base para un juego sistémico.

## Principios
- El motor posee la verdad del mundo. La interfaz solo representa estado confirmado.
- Generación procedural determinista con streams nombrados por sistema.
- La IA generativa, si se incorpora, será una capa opcional de interpretación; nunca ejecutará cambios de mundo por sí misma.
- Los ticks son explícitos: las acciones con consecuencias consumen tiempo y permiten respuesta de NPC.
- UI y simulación desacopladas; el mundo no depende de imágenes prehechas.

## Desarrollo
npm install
npm run dev
npm test
npm run build

## Voz local de NPCs (Ollama)

La página web no llama a Ollama directamente: usá el puente local para evitar los problemas de CORS del navegador. En la PC donde abrís Dysto, abrí una terminal y ejecutá:

```bash
curl -fL https://sb-5hj233f78g7w.vercel.run/dysto-ollama-bridge.mjs -o dysto-ollama-bridge.mjs
ollama pull qwen2.5:3b
node dysto-ollama-bridge.mjs
```

Dejá esa terminal abierta y volvé a Dysto en el navegador. El script se descarga directamente desde la versión actualizada del juego; no hace falta copiar archivos a mano ni clonar el repositorio. El puente escucha solo en `127.0.0.1:11435` y reenvía las conversaciones a Ollama en `127.0.0.1:11434`; no expone el modelo a la red local. Para comprobarlo, abrí `http://127.0.0.1:11435/health`: debe mostrar `"ok":true` y una lista de modelos que incluya `qwen2.5:3b`. Si el puerto 11435 está ocupado, usá `DYSTO_BRIDGE_PORT=11436 npm run ai:bridge` y cambiá `LOCAL_AI_ENDPOINT` en `src/ai/local-dialogue.ts` al mismo puerto.

## Estructura
- src/core: PRNG reproducible, tipos y reglas de simulación.
- src/world: generación de mapa y actores.
- src/ui: presentación y controles.
- tests: pruebas del determinismo y reglas esenciales.

## Límites actuales
Esto es una primera vertical slice, no el juego completo. No hay servidor multijugador, modelos generativos, persistencia remota ni simulación de población a gran escala. El mapa es generado por semilla y renderizado con canvas; el estado vive en memoria de la sesión.


## Probar OpenCode como modelo alternativo (experimental)

La integración de Ollama sigue intacta. Para probar el modelo configurado en OpenCode, primero iniciá su servidor local en la PC:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

En otra terminal, desde una carpeta donde hayas descargado el puente de Dysto, ejecutá:

```bash
curl -fL https://sb-5hj233f78g7w.vercel.run/dysto-opencode-bridge.mjs -o dysto-opencode-bridge.mjs
node dysto-opencode-bridge.mjs
```

Abrí Dysto con `?ai=opencode` al final de la URL para usar OpenCode solo en esa pestaña: `https://sb-5hj233f78g7w.vercel.run/?ai=opencode`. La URL normal sigue usando Ollama. La primera petición puede requerir permitir el acceso a la red local en el navegador. El puente no habilita herramientas para el modelo; solo toma texto de entrada y devuelve texto de respuesta.

Si protegés el servidor con `OPENCODE_SERVER_PASSWORD`, definí la misma variable en la terminal del puente. Para una dirección o puerto distintos, configurá `DYSTO_OPENCODE_URL` y `DYSTO_OPENCODE_BRIDGE_PORT`.
