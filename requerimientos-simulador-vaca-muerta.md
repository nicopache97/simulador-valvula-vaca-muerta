# Especificación de Requerimientos de Software y Casos de Prueba
## Simulador de Firma de Válvulas y Calibración de Transmisores (AMS / P&Di)
**Proyecto:** Simulador de Instrumentación Industrial para Vaca Muerta (SoldEnergyarg / Tecfield)  
**Estándar de Estructuración:** Top-Down (ISO/IEC/IEEE 29148 / IEEE 830)  
**Fundamentos de Instrumentación:** Antonio Creus Solé (8ª Ed.)  
**Estándares Tecnológicos:** FMI 3.0, ANSI/ISA-101.01-2015, ISA-18.2, ISA/IEC 62443  

---

## 1. REQUERIMIENTOS GENERALES (NIVEL 1 - TOP-LEVEL)

### REQ-GEN-01: Simulación Dinámica e Interactiva en Tiempo Real
* **Descripción:** El sistema debe simular en tiempo real el comportamiento físico-mecanico de válvulas de control (firma de válvula) y transmisores inteligentes (HART / Foundation Fieldbus / AMS) operando bajo condiciones no convencionales de yacimiento (Vaca Muerta).
* **Criterio de Aceptación General:** Ejecución continua sin divergencias numéricas con paso de comunicación $\Delta t \le 10\text{ ms}$.

#### Caso de Prueba: TC-GEN-01
* **Objetivo:** Verificar la estabilidad y continuidad de la simulación en tiempo real durante un ciclo de operación continua de 1 hora.
* **Precondiciones:** Servidor de co-simulación FMI 3.0 inicializado con parámetros nominales de presión ($P_1 = 100\text{ bar}$, $P_2 = 30\text{ bar}$).
* **Procedimiento:**
  1. Iniciar la simulación en modo Co-Simulation FMI 3.0.
  2. Enviar una rampa de consigna de posición $SP$ de 0% a 100% y de 100% a 0% a $0.5\%/\text{s}$.
  3. Registrar la fluctuación del paso temporal y el consumo de memoria del ejecutable durante 3600 segundos.
* **Resultado Esperado:** El motor completa la prueba sin abortar, el tiempo de cálculo por paso no supera los $5\text{ ms}$ y la deriva de memoria es menor al 1%.

---

### REQ-GEN-02: Arquitectura Abierta e Interoperable (FMI 3.0 & WASM)
* **Descripción:** El núcleo de simulación física debe estar encapsulado como una Unidad de Co-Simulación FMI 3.0 (FMU) capaz de exportarse y ejecutarse tanto en entornos C/C++ nativos como en clientes web navegables mediante compilación a WebAssembly (WASM).
* **Criterio de Aceptación General:** Exportación válida del paquete `.fmu` con manifiesto `modelDescription.xml` compatible con el esquema FMI 3.0.2.

#### Caso de Prueba: TC-GEN-02
* **Objetivo:** Validar la carga, lectura de metadatos e instanciación de la FMU desde una interfaz web cliente mediante WebAssembly.
* **Precondiciones:** Archivo `ValvulaTransmisor.fmu` compilado para WASM disponible en servidor web local.
* **Procedimiento:**
  1. Invocar la función `fmi3InstantiateCoSimulation` desde el entorno JavaScript/WASM.
  2. Verificar la extracción correcta de las variables de entrada/salida definidas en `modelDescription.xml`.
  3. Ejecutar 100 pasos de simulación mediante `fmi3DoStep`.
* **Resultado Esperado:** La función retorna estado `fmi3OK`, asigna correctamente las referencias de valor (*ValueReferences*) y calcula las salidas sin excepciones de memoria en el runtime WASM.

---

## 2. REQUERIMIENTOS FUNCIONALES ESPECÍFICOS (NIVEL 2 - SUBSISTEMAS)

---

### 2.1 Módulo Físico y Firma de Válvulas (REQ-FUN-VAL)

#### REQ-FUN-VAL-01: Cálculo y Graficación de la Firma de Válvula (Presión Actuador vs. Carrera Vástago)
* **Descripción:** El modelo matemático de la válvula debe calcular de manera continua la relación entre la presión en la cámara del actuador neumático ($P_{\text{act}}$) y la posición real del vástago ($x_{\text{vástago}}$), reproduciendo la curva de "Firma de Válvula" (*Valve Signature*) descrita por Antonio Creus Solé.
* **Parámetros Físicos Representados:** Histéresis mecánica, zona muerta (*deadband*), rozamiento estáctico/dinámico de empaquetadura (*packing friction*) y constante del resorte del servomotor.

##### Caso de Prueba: TC-FUN-VAL-01
* **Objetivo:** Medir la histéresis y la zona muerta simuladas durante un ciclo completo de apertura y cierre.
* **Precondiciones:** Fricción de empaque configurada en $15\%$, rango del actuador de $3\text{ a }15\text{ psi}$ ($0.2\text{ a }1.0\text{ bar}$).
* **Procedimiento:**
  1. Variar la presión del actuador de $3\text{ psi}$ a $15\text{ psi}$ en incrementos de $0.1\text{ psi}$ (fase ascendente) y luego descender de $15\text{ psi}$ a $3\text{ psi}$ (fase descendente).
  2. Graficar $P_{\text{act}}$ vs. $x_{\text{vástago}}$.
  3. Medir la separación horizontal máxima en $50\%$ de carrera.
* **Resultado Esperado:** La curva muestra un lazo de histéresis cerrado identificable. La diferencia entre las presiones de apertura y cierre al $50\%$ corresponde exactamente a la fuerza de fricción programada ($\pm 1.5\%$).

---

#### REQ-FUN-VAL-02: Simulación de Transitorios Hidráulicos y Cavitación en Estrangulamiento
* **Descripción:** El simulador debe calcular el caudal másico y volumétrico que atraviesa la válvula considerando el coeficiente $C_v$, la caída de presión $\Delta P = P_1 - P_2$ y la detección del régimen de flujo ahogado o cavitación crítica mediante el factor de recuperación de presión del fluido $F_L$.

##### Caso de Prueba: TC-FUN-VAL-02
* **Objetivo:** Confirmar la saturación de caudal (flujo ahogado por cavitación) cuando la presión aguas abajo $P_2$ cae por debajo de la presión de vapor del fluido $P_v$.
* **Precondiciones:** Válvula con $C_v = 50$, $F_L = 0.9$, $P_1 = 80\text{ bar}$.
* **Procedimiento:**
  1. Mantener $P_1$ constante en $80\text{ bar}$ y la apertura al $100\%$.
  2. Reducir paulatinamente $P_2$ desde $70\text{ bar}$ hasta $5\text{ bar}$.
  3. Registrar el caudal calculado en cada punto.
* **Resultado Esperado:** Inicialmente el caudal aumenta proporcionalmente a $\sqrt{\Delta P}$. Al alcanzar la condición de cavitación crítica ($P_1 - P_2 \ge F_L^2 (P_1 - r_c P_v)$), el caudal se estabiliza en un valor límite horizontal constante.

---

### 2.2 Módulo Transmisores Inteligentes y Sistema AMS (REQ-FUN-TRM)

#### REQ-FUN-TRM-01: Emulación de Estructura de Bloques Fieldbus / HART
* **Descripción:** Los transmisores simulados (presión diferencial, temperatura) deben emular la arquitectura funcional interna de instrumentos inteligentes descrita por Creus Solé:
  * **Resource Block (RB):** Identificación del dispositivo, fabricante, número de serie y diagnóstico global.
  * **Transducer Block (TB):** Lectura primaria del sensor, caracterización de linealidad y compensación térmica.
  * **Function Block (FB / AI / PID):** Escalamiento a unidades de ingeniería, filtrado ($amortiguamiento / damping$), límites de rango e integración de algoritmo PID.

##### Caso de Prueba: TC-FUN-TRM-01
* **Objetivo:** Verificar la propagación de datos y estado de calidad desde el Transducer Block hacia el Function Block de Entrada Analógica (AI).
* **Precondiciones:** Transmisor configurado con $LRV = 0\text{ bar}$, $URV = 100\text{ bar}$, constante de amortiguamiento $\tau = 2.0\text{ s}$.
* **Procedimiento:**
  1. Aplicar un escalón repentino en la variable física de entrada de $10\text{ bar}$ a $50\text{ bar}$.
  2. Inyectar una falla simulada en el sensor mediante la bandera `TB_Sensor_Fault = TRUE`.
  3. Leer el valor de salida `AI.PV` y el estado de calidad de la variable `AI.PV.Quality`.
* **Resultado Esperado:** La variable `AI.PV` responde con una curva exponencial de primer orden con constante de tiempo $2.0\text{ s}$. Al activarse la falla, `AI.PV.Quality` cambia de `GOOD` a `BAD_SENSOR_FAILURE` en menos de $10\text{ ms}$.

---

#### REQ-FUN-TRM-02: Rutina de Autocalibración y Re-Rango (*Turndown / Rangeability* 400:1) vía AMS
* **Descripción:** El simulador debe emular la interfaz de un comunicador de campo (HART / Fieldbus) o estación AMS para ejecutar comandos digitales de ajuste de cero (*Zero Trim*), ajuste de escala (*Span Trim*) y reconfiguración de rango dinámico sin aplicar patrones físicos en taller.

##### Caso de Prueba: TC-FUN-TRM-02
* **Objetivo:** Validar el re-rango a distancia de un transmisor piezoresistivo inteligente manteniendo la exactitud de medición.
* **Precondiciones:** Transmisor de presión diferencial con rango nominal de $0\text{ a }400\text{ mbar}$.
* **Procedimiento:**
  1. Leer la salida del transmisor a una presión de $20\text{ mbar}$ (debería indicar $5\%$ de la escala original).
  2. Enviar por comando de configuración un nuevo rango de $URV = 40\text{ mbar}$ (relación de turndown 10:1).
  3. Volver a evaluar la salida del transmisor para la misma entrada de $20\text{ mbar}$.
* **Resultado Esperado:** La señal recalculada digitalmente pasa a indicar exactamente $50.0\%$ de la nueva escala reconfigurada.

---

### 2.3 Motor de Co-Simulación FMI 3.0 (REQ-FUN-SIM)

#### REQ-FUN-SIM-01: Intercambio de Variables en *Intermediate Update Mode*
* **Descripción:** El simulador FMI 3.0 debe soportar el modo de actualización intermedia (`providesIntermediateUpdate = true`), permitiendo que el entorno integrador consulte y actualice variables continuas entre puntos de comunicación principales mediante la función callback `fmi3IntermediateUpdateCallback`.

##### Caso de Prueba: TC-FUN-SIM-01
* **Objetivo:** Comprobar la actualización fluida de entradas continuas durante la ejecución interna de un paso de simulación.
* **Precondiciones:** FMU instanciada con soporte de callbacks intermedios habilitado.
* **Procedimiento:**
  1. Iniciar un paso de comunicación largo $h = 100\text{ ms}$ vía `fmi3DoStep`.
  2. Dentro del cálculo interno, hacer que la FMU llame a `fmi3IntermediateUpdateCallback` en $t = 30\text{ ms}$ con `intermediateVariableSetRequested = true`.
  3. Modificar la entrada de presión $P_1$ desde el cliente integrador.
* **Resultado Esperado:** La FMU acepta los nuevos valores intermedios y completa el paso en $t = 100\text{ ms}$ incorporando la variación de $P_1$ ocurrida a los $30\text{ ms}$.

---

#### REQ-FUN-SIM-02: Mecanismo de Interrupción *Early Return* ante Eventos Discretos
* **Descripción:** Cuando la FMU detecte una discontinuidad física (como disparo de interbloqueo de seguridad o tope mecánico del vástago), debe poder retornar anticipadamente del paso de integración (`earlyReturn = true`) informando la estampa temporal exacta `lastSuccessfulTime`.

##### Caso de Prueba: TC-FUN-SIM-02
* **Objetivo:** Verificar la interrupción inmediata de un paso de integración al impactar el vástago contra el asiento de la válvula.
* **Precondiciones:** Paso solicitado $h = 50\text{ ms}$, posición actual de la válvula al $95\%$ abriéndose rápidamente.
* **Procedimiento:**
  1. Invocar `fmi3DoStep(currentCommunicationPoint=1.0, communicationStepSize=0.05)`.
  2. La física de la válvula alcanza el tope mecánico (carrera = 100%) en $t = 1.018\text{ s}$.
  3. Inspeccionar el valor de retorno de `fmi3DoStep`.
* **Resultado Esperado:** La función retorna `fmi3OK`, la bandera `earlyReturn` se establece en `true` y `lastSuccessfulTime` devuelve exactamente $1.018\text{ s}$.

---

#### REQ-FUN-SIM-03: Ejecución Programada (*Scheduled Execution*) y Relojes Síncronos
* **Descripción:** Para la simulación de lazos discretos de control e interbloqueos lógico-secuenciales, el motor debe soportar la activación de particiones del modelo guiadas por relojes periódicos (*time-based*) y desencadenados (*triggered*) mediante `fmi3ActivateModelPartition`.

##### Caso de Prueba: TC-FUN-SIM-03
* **Objetivo:** Validar la ejecución determinista de una tarea de control discreta a la frecuencia exacta fijada por un reloj síncrono de $10\text{ ms}$.
* **Precondiciones:** Reloj periódico de $10\text{ ms}$ asociado a la partición de algoritmo PID.
* **Procedimiento:**
  1. Simular durante $1.0\text{ segundo}$ de tiempo de proceso.
  2. Registrar el número de ejecuciones de la función `fmi3ActivateModelPartition`.
* **Resultado Esperado:** La partición del algoritmo PID se activa exactamente 100 veces, sin desfases acumulativos en la estampa temporal.

---

## 3. REQUERIMIENTOS NO FUNCIONALES (NIVEL 2 - RENDIMIENTO, ARQUITECTURA Y SEGURIDAD)

---

### REQ-NFUN-PERF-01: Frecuencia de Refresco HMI y Latencia Computacional
* **Descripción:** El motor de cálculo debe ejecutar la física del proceso con un tiempo de procesamiento inferior al 20% del paso de integración en tiempo real, garantizando una tasa de refresco gráfica en la interfaz HMI de al menos 20 imágenes por segundo ($\ge 20\text{ FPS}$).

#### Caso de Prueba: TC-NFUN-PERF-01
* **Objetivo:** Medir el perfil de tiempo de CPU gastado en la función `fmi3DoStep` frente al tiempo simulado transcurrido.
* **Precondiciones:** Modelo ejecutándose en hardware estándar de campo (procesador Quad-Core x86_64 o ARM64).
* **Procedimiento:**
  1. Ejecutar 10,000 pasos de integración de $\Delta t = 10\text{ ms}$ (100 segundos de simulación de proceso).
  2. Medir el tiempo real de reloj de pared (*wall-clock time*) consumido.
* **Resultado Esperado:** El tiempo total transcurrido de CPU es menor a $20\text{ segundos}$ (factor de tiempo real $\ge 5\times$).

---

### REQ-NFUN-PORT-01: Ejecución Multiplataforma y Cero Dependencias Propietarias
* **Descripción:** El simulador debe ser completamente autocontenido y capaz de compilar e interactuar mediante librerías C-API estándar (`.so` en Linux, `.dll` en Windows, ejecutable WASM en navegadores) sin requerir licencias ni ejecutables de software comercial propietario (como MATLAB/Simulink o LabVIEW) en el cliente.

#### Caso de Prueba: TC-NFUN-PORT-01
* **Objetivo:** Probar el despliegue y ejecución nativa en un contenedor Linux limpio libre de entornos propietarios.
* **Precondiciones:** Imagen contenedora minimalista (Alpine / Ubuntu Server) únicamente con dependencias estándar de C runtime.
* **Procedimiento:**
  1. Copiar el archivo `.fmu` compilado y el ejecutable anfitrión (*host loader*).
  2. Iniciar la simulación mediante script de línea de comandos.
* **Resultado Esperado:** La simulación se ejecuta correctamente, genera los archivos de tendencias de salida en formato CSV/JSON y finaliza con código de salida `0`.

---

### REQ-NFUN-SEC-01: Control de Acceso por Roles (RBAC) e Integridad de Datos (ISA/IEC 62443)
* **Descripción:** El sistema debe implementar perfiles de usuario diferenciados (Operador, Técnico de Campo, Ingeniero de Procesos) limitando la modificación de parámetros de calibración y modelos según las directrices de ciberseguridad industrial ISA/IEC 62443.

#### Caso de Prueba: TC-NFUN-SEC-01
* **Objetivo:** Verificar el bloqueo de reconfiguración de transmisores cuando un usuario ingresa con rol de Operador.
* **Precondiciones:** Usuario autenticado con rol `OPERATOR`.
* **Procedimiento:**
  1. Intentar enviar una trama de comando digital HART para modificar el valor de `URV` (Span) del transmisor.
  2. Verificar el mensaje de respuesta del sistema.
* **Resultado Esperado:** La solicitud es rechazada con una excepción de seguridad `ERR_ACCESS_DENIED`, dejando un registro en el log de auditoría del sistema.

---

## 4. REQUERIMIENTOS DE INTERFAZ DE USUARIO HMI / UX (NIVEL 2 - NORMAS ANSI/ISA-101 Y ISA-18.2)
*(Nota: Según los criterios de diseño ergonómico de la norma ANSI/ISA-101.01-2015, los requerimientos visuales de UI/UX se evalúan mediante inspección visual y auditoría ergonómica de pantalla en lugar de casos de prueba de código de software).*

---

### REQ-UI-01: Fondo Neutro y Control de Contraste Cromático
* **Descripción:** El fondo de todas las pantallas operativas debe ser un tono neutro uniforme (Gris claro u oscuro, p. ej. RGB #D3D3D3 o #2B2B2B). Las líneas de proceso y equipos inactivos o en estado normal se representan en gris oscuro o negro de baja saturación. Se prohíbe el uso de color saturado para estados normales de funcionamiento.
* **Método de Verificación:** Inspección visual y auditoría de paleta de colores según la Guía de Estilo HMI de Alto Rendimiento.

---

### REQ-UI-02: Indicadores Analógicos Móviles Contextuales
* **Descripción:** En lugar de desplegar datos numéricos aislados ("Sea of Numbers"), las variables analógicas clave deben mostrarse mediante indicadores de barra analógica horizontal o vertical. El indicador debe incluir sombreado explícito del rango normal de operación y bandas límite de alarma.
* **Método de Verificación:** Inspección ergonómica comprobando que la lectura del estado de la planta (dentro/fuera de rango) sea asimilable en menos de 3 segundos por visión periférica.

---

### REQ-UI-03: Jerarquía Visual Navegable de 4 Niveles
* **Descripción:** El sistema HMI debe organizarse estrictamente en 4 niveles jerárquicos de navegación:
  * **Nivel 1 (Proceso / Macro):** Visión general del yacimiento/planta con indicadores KPI y resumen global de alarmas.
  * **Nivel 2 (Unidad de Control):** Pantalla principal de operación del área (ej. colector o patín de medición).
  * **Nivel 3 (Detalle de Equipo):** Vista detallada del conjunto válvula-actuador e interbloqueos asociados.
  * **Nivel 4 (Diagnóstico / Faceplate):** Ventana emergente específica para calibración de transmisor o prueba de firma de válvula.
* **Método de Verificación:** Verificación de flujo de navegación garantizando que cualquier cara operativa sea accesible en un máximo de 2 clics desde la pantalla principal.

---

### REQ-UI-04: Codificación Redundante de Alarmas (Color + Forma Geométrica + Prioridad ISA-18.2)
* **Descripción:** Las condiciones de alarma deben ser inmediatamente reconocibles respetando la norma ISA-18.2 y ser accesibles para operadores con acromatopsia o daltonismo. Cada alarma debe utilizar codificación doble fija:
  * **Prioridad 1 (Crítica):** Cuadrado Rojo con el número "1" en blanco.
  * **Prioridad 2 (Alta):** Triángulo Amarillo con el número "2" en negro.
  * **Prioridad 3 (Baja):** Círculo Azul con el número "3" en blanco.
* **Método de Verificación:** Auditoría gráfica en pantalla en estados de alarma simulados comprobando la visibilidad del símbolo en modo monocromático o escala de grises.
