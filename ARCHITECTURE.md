# Dysto: arquitectura y decisiones de viabilidad

## Objetivo de esta fase
Conseguir una vertical slice ejecutable: un mundo pequeño generado por semilla, mapa isométrico navegable, estado del personaje, PNJ con perfiles y reacción básica, reloj por ticks, inventario e interfaz de observación/interacción.

## Capas
- Core: tipos de estado, generador pseudoaleatorio estable, validación de movimiento, reloj y acciones.
- World: construcción procedural del terreno, calles, edificios, puntos de aparición y población inicial.
- Simulation: los ticks actualizan necesidades, alerta, movimientos y consecuencias. Actualmente está dentro de core/engine.ts; separar módulo cuando las reglas crezcan.
- UI: canvas isométrico sin PNG de mapa, paneles DOM y entradas de teclado/ratón. La UI lee estado y solicita acciones al motor.
- Tests: pruebas del determinismo, streams, ticks y rechazo de acciones inválidas.

## Principios que no se negocian
1. El motor es la autoridad. Un modelo generativo no cambia HP, inventario, posición, relaciones ni hechos del mundo.
2. Cada subsistema recibe un stream nombrado derivado de la semilla. Añadir aleatoriedad cosmética no debe alterar decisiones de otros subsistemas.
3. Las acciones se validan antes de mutar el estado. Las acciones que avanzan el tiempo disparan la simulación del mundo.
4. La percepción se limita por distancia/visibilidad; la interfaz no expone metas internas como conocimiento automático del jugador.
5. Toda mejora se valida con build, pruebas y comprobación de uso real, no solo con una pantalla que compila.

## Viabilidad con los recursos actuales
- Procedural 2D/isométrico, miles de tiles, actores modestos y simulación por turnos: viable en 2 vCPU/4 GB si se evita recalcular todo cada frame y se acota la población activa.
- Persistencia local/exportable y partidas guardadas: viable; aún no implementada.
- IA de comportamiento basada en reglas, objetivos y memoria estructurada: viable y reproducible.
- LLM opcional para interpretar lenguaje y producir diálogo condicionado por hechos: viable mediante API externa, pero tiene coste, latencia, límites de red y no puede ser parte de la ruta determinista del motor.
- Simular miles de PNJ con planificación compleja cada frame, mundo 3D realista, entrenamiento de modelos propios o una población de agentes LLM autónomos en este sandbox: no es un objetivo realista. Requeriría backend persistente, optimización y presupuesto aparte.
- Vercel sirve para alojar una web y APIs ligeras, pero no debe tratarse como un servidor de simulación permanente de un mundo vivo. Para una futura simulación online persistente habría que elegir infraestructura dedicada.
- Esta primera build usa estado en memoria. Reiniciar la pestaña reinicia la partida. No hay backend, multijugador ni llamadas a LLM.

## Próximas fases
A. Validar la vertical slice y cerrar fallos de movimiento, visibilidad y UI.
B. Separar navegación/IA de PNJ, añadir objetivos, memoria episódica, necesidades y relaciones reproducibles.
C. Añadir interacción social con consecuencias explícitas, reputación y testigos.
D. Implementar guardado versionado y migraciones.
E. Añadir regiones/lotes procedurales y generador de sucesos con pruebas doradas.
F. Diseñar frontera de IA externa: salida estructurada, validación, rechazo seguro y cero autoridad sobre el estado.


## Fase de simulación social (en curso)
- Cada NPC tiene rasgos sociales independientes: susceptibilidad, reactividad, rencor, orgullo, autocontrol, venganza y disposición a reconciliarse.
- Los recuerdos sociales guardan actor objetivo, tick, tipo de evento, intensidad, saliencia, publicidad e interpretación. Los recuerdos no son borrados por una conversación amable.
- La relación separa afecto, confianza, respeto, resentimiento, miedo, deuda y hostilidad. Ayudar o salvar puede crear deuda y confianza sin reducir el resentimiento existente.
- Las reacciones agresivas se calculan como una decisión motivada y limitada por autocontrol, miedo y fuerza relativa; no como un cambio automático de diálogo.
- Rasgos, recuerdos y relaciones son datos del motor determinista. El texto generativo no los modifica directamente.
- Primera entrega: eventos sociales básicos derivados del texto, con tests. Pendiente: diálogo contextual más amplio, reputación transmitida entre NPCs con conocimiento verificable, relaciones NPC-NPC, consecuencias de testigos y persistencia en guardado.

## Progresión RPG: decisiones fijadas, implementación pendiente
- No se usará un nivel universal que escale al jugador y al mundo a la vez.
- Los atributos describen capacidad general; las habilidades describen competencia entrenada; el estado temporal describe lesiones, fatiga, hambre, estrés, equipo y efectos del Psico-Link.
- Se propone una escala de habilidad 0-10 y chequeos D20 con modificadores acotados. Es una hipótesis para calibrar, no una fórmula cerrada todavía.
- La dificultad corresponde a la tarea y al contexto. Los NPCs no reciben bonificaciones por el nivel del jugador.
- La progresión necesita pruebas estadísticas y antifarmeo antes de conectarse al combate o a la interfaz.


## Conocimiento social y rumores

- Un NPC no conoce un hecho solo porque exista en el estado global. Debe presenciarlo con distancia y línea de visión, o recibirlo de un contacto.
- Cada registro de conocimiento conserva evento, sujetos, tick, confianza, interpretación, origen (testigo o rumor) y saltos de transmisión.
- La red de contactos se genera con el stream social de la semilla y no equivale a que todos los NPC se conozcan.
- Los rumores solo se transmiten entre contactos vivos y cercanos. La confianza cae, la interpretación depende de rasgos y la cadena tiene un máximo de dos saltos.
- La reputación es local a cada observador y al sujeto del evento; no existe una puntuación global omnisciente.
- La simulación de rumores usa un stream nombrado por tick. El texto generado o la interfaz no puede inventar hechos ni difundirlos directamente.
- Límite actual: las decisiones de trabajo, cooperación, denuncia y violencia aún no consultan de forma integral esta reputación. Integrar esa capa después de definir objetivos y riesgos de cada NPC.
