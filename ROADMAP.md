# Dysto: hoja de ruta de desarrollo

## Regla de diseño
La simulación determinista define los hechos. Los NPCs actúan con información incompleta, objetivos y recursos limitados. La IA generativa puede interpretar lenguaje y proponer intenciones, pero nunca escribir resultados directamente en el estado del mundo.

## Orden de implementación

### 1. Núcleo reproducible
- Semillas y streams nombrados por subsistema.
- Validación de acciones y consecuencias en un solo motor.
- Pruebas de determinismo y de rechazo de acciones inválidas.
- Estado serializable para guardado, sin depender de la interfaz.

### 2. NPCs con memoria y relaciones (fase actual)
- Rasgos sociales independientes, no etiquetas que dicten cada decisión.
- Memorias episódicas con tick, objetivo, intensidad, contexto e interpretación.
- Relaciones separadas: afecto, confianza, respeto, resentimiento, miedo, deuda y hostilidad.
- Una buena acción puede crear deuda o confianza sin borrar agravios previos.
- Olvido lento y dependiente de los rasgos; recordar un hecho no implica sentirlo con la misma intensidad para siempre.
- Las decisiones agresivas consideran hostilidad, resentimiento, venganza, autocontrol, miedo y riesgo.
- Implementado: testigos con distancia y línea de visión; conocimiento individual y reputación local por sujeto; red de contactos NPC generada con semilla; rumores de uno o dos saltos con confianza reducida y posibilidad determinista de distorsión.
- Implementado: la conversación del jugador puede generar conocimiento para testigos; los rumores solo circulan entre contactos vivos que estén cerca.
- Pendiente: que la reputación y las relaciones NPC-NPC modifiquen decisiones concretas de trabajo, cooperación, denuncia, venganza y combate. La memoria social todavía no gobierna todo el árbol de decisiones del NPC.

### 3. Progresión RPG sin escalado artificial
- No hay nivel global que aumente todas las estadísticas.
- Seis atributos generales; habilidades específicas mejoran por práctica pertinente, instrucción y experiencia significativa.
- Las lesiones, fatiga, hambre, estrés, equipo y Psico-Link alteran el rendimiento actual, no el conocimiento permanente.
- Tiradas D20 con modificadores acotados y dificultad de la tarea; el mundo no escala para perseguir al jugador.
- Antifarmeo: las repeticiones idénticas y sin aprendizaje no generan progreso ilimitado.
- Antes de añadir UI de progresión, calibrar dificultades con pruebas de distribución.

### 4. Acciones y simulación cotidiana
- Acciones contextuales con coste de tiempo, requisitos y consecuencias explícitas.
- Necesidades y objetivos de NPCs actualizados mediante ticks; simulación resumida fuera de la zona activa.
- Daño, lesiones, recuperación, equipo, economía y recursos deben influir en decisiones, no existir solo como barras.

### 5. Mundo procedural y narrativas emergentes
- Generación reproducible de barrios, edificios, población, facciones, recursos y conflictos.
- Historias resultantes de objetivos que chocan, información parcial, relaciones y eventos.
- Nada de mapas PNG obligatorios ni regiones con etiquetas decorativas fijas.
- Semillas separadas para mapa, población, economía, eventos y decisiones de NPCs.

### 6. Interfaz y plataformas
- Mapa isométrico central, observación y acciones contextuales; evitar una lista de comandos genéricos.
- Controles adaptados a móvil vertical, móvil horizontal y PC, con detección automática y selector manual.
- La UI muestra lo que el personaje puede percibir, no valores privados o intenciones ocultas.
- Guardado versionado y pruebas de migración antes de añadir sincronización entre dispositivos.

## Criterio para considerar una fase terminada
Una compilación exitosa no basta. Cada fase requiere pruebas de reglas, determinismo y casos límite. Las funciones visibles deben probarse en la interfaz real. Si algo solo está implementado en el motor, no se presenta como función ya disponible en el juego publicado.
