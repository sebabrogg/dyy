# Voz de NPC mediante IA local

La integración inicial usa la API local de Ollama. No usa una API comercial, no envía conversaciones a un proveedor remoto y no requiere pagos. Si Ollama no responde, Dysto conserva la respuesta determinista del motor.

## Preparación de desarrollo

1. Instalar Ollama desde https://ollama.com/.
2. Descargar el modelo inicial: `ollama pull qwen2.5:3b`.
3. Iniciar Ollama y ejecutar Dysto localmente con `npm run dev`.
4. Seleccionar un NPC cercano y hablarle. El estado de la interfaz indica si se pudo usar el modelo local.

El modelo solo reformula la intención de una respuesta que ya decidió el motor. No modifica relaciones, recuerdos, inventario, acciones ni hechos del mundo. Se limita a 1-2 frases, usa streaming para mostrar parciales y tiene un tiempo límite total de 9 segundos. La respuesta segura del motor aparece primero, por lo que la partida no espera a la IA.

## Límites conocidos

- Esta primera integración funciona desde Dysto servido localmente; una web HTTPS publicada no puede conectarse directamente al endpoint HTTP local de Ollama.
- El jugador debe descargar el modelo una vez. La descarga no tiene costo, pero ocupa almacenamiento y la inferencia usa CPU/GPU y memoria del dispositivo.
- Qwen 2.5 3B es un candidato inicial, no una garantía de velocidad o calidad en todos los equipos.
- Aún no se ha medido latencia en PC o Android ni se ha probado en una sesión real con Ollama. No se considera lista para producción hasta hacer esas pruebas.
- El diálogo del motor sigue siendo la autoridad semántica. La IA local mejora la formulación, no crea todavía conversaciones abiertas sin restricciones.
