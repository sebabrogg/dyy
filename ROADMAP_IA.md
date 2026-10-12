# Hoja de ruta de la IA de Dysto

## Principio rector
La IA interpreta personas; el motor determinista conserva la autoridad sobre el mundo. La complejidad debe emerger de memoria, objetivos, relaciones, información incompleta y consecuencias, no de multiplicar comandos ni de convertir cada interacción en una respuesta bonita sin efecto.

## Fases y dependencias

### 1. Identidad y límites de conocimiento (base actual)
- Separar identidad propia del NPC, modelo individual del jugador, experiencias directas y rumores atribuidos a una fuente.
- Dar al modelo solo información disponible para ese NPC; distinguir hechos, interpretaciones y rumores.
- Contexto de diálogo siempre ligado al NPC seleccionado.
- Puerta de calidad: pruebas contra filtración de datos ocultos, confusión de personajes y contexto sin identidad.

### 2. Memoria episódica persistente
- Registrar turnos relevantes, promesas, favores, insultos, amenazas y traiciones como eventos con sujeto, tick, importancia y procedencia.
- Resumir por NPC sin borrar hechos importantes; distinguir lo recordado de lo inferido.
- Puerta de calidad: guardar/cargar una partida y verificar que los recuerdos sobreviven.

### 3. Modelo del jugador y relaciones multidimensionales
- Cada NPC mantiene creencias separadas sobre identidad, competencia, intenciones y fiabilidad del jugador.
- Confianza, hostilidad, resentimiento, miedo, respeto, afecto y deuda no se colapsan en una puntuación única.
- Cambios graduales y no automáticos; una ayuda no borra una traición.
- Puerta de calidad: pruebas de cambio de opinión con evidencias concretas y resultados no deterministas prohibidos.

### 4. Conocimiento social y rumores
- Propagar información por contactos, con fuente, saltos, confianza y distorsión.
- Solo testigos válidos conocen eventos directos; NPCs pueden desconocer hechos cercanos.
- Puerta de calidad: probar quién pudo saber qué y cuándo.

### 5. Objetivos autónomos y encargos
- Misiones de vida con necesidades, recursos, riesgos, condiciones y prioridades.
- Encargos nacen de objetivos del NPC y de su evaluación del jugador; oferta, aceptación, rechazo y finalización son estados del motor.
- La IA redacta el diálogo acorde al resultado real, nunca inventa una quest ni contradice su estado.
- Puerta de calidad: cada promesa/aceptación/rechazo coincide con el registro de encargos.

### 6. Simulación social y mundo vivo
- Rutinas, alianzas, conflictos, economía local, facciones y consecuencias colectivas.
- Eventos simulados por reglas; la IA ayuda a interpretar, no reemplaza reglas reproducibles.
- Puerta de calidad: pruebas de determinismo, rendimiento y explicabilidad causal.

### 7. Evaluación y escalado
- Conjunto de escenarios automatizados para memoria, identidad, rumores, engaño, objetivos y contradicciones.
- Medir latencia y uso de contexto antes de aumentar modelos o complejidad.
- Ninguna fase se considera terminada por sonar convincente: debe superar pruebas de estado y regresión.

## Límites de alcance
- No exponer inventario, estadísticas internas, pensamientos privados de otros NPC ni estado global secreto al modelo de diálogo.
- No dejar que una salida libre de la IA escriba directamente el estado del mundo.
- No añadir comandos como sustituto de una simulación social coherente.
- Primero fiabilidad y memoria; después mayor autonomía y escala.
