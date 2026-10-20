# Simulador de Firma de Válvulas y Calibración de Transmisores

Simulador de instrumentación industrial: una válvula de control con actuador neumático, un transmisor de presión inteligente y su lazo PID, corriendo en tiempo real en el navegador a 100 Hz. La física sigue a Creus Solé (Instrumentación Industrial, 8ª ed.) e IEC 60534-2-1; la HMI, ISA-101 e ISA-18.2; y el núcleo se exporta además como FMU FMI 3.0 en WebAssembly.

Fundamentos técnicos: Creus Solé 8ª ed., IEC 60534-2-1, FMI 3.0, ISA-101.01-2015, ISA-18.2, ISA/IEC 62443.

## 1. Qué es y para quién

Es un entrenador interactivo para:

- **Técnicos de campo** que calibran transmisores y diagnostican válvulas "tiradas" (pegadas, con histéresis anómala).
- **Operadores** que necesitan entender qué ve (y qué no ve) el lazo de control cuando una señal cae a BAD o una válvula cavitica.
- **Ingenieros que empiezan** con instrumentación de campo en contexto shale gas.

**¿Por qué un simulador?** Porque en la planta real estos efectos o no se ven hasta que cuestan un equipo, o no se ven nunca:

- La **histéresis y la fricción de empaquetadura** de una válvula solo se revelan con una firma de válvula (barrido lento de presión del actuador), un ensayo que casi nadie hace en operación normal — y que acá es un botón.
- La **cavitación** destruye asientos y cuerpo de válvula por erosión; en planta la detectás tarde, por el ruido o por el daño. Acá la podés provocar, verla saturar el caudal y leer la condición exacta IEC 60534 que la dispara.
- Una **falla de sensor** (calidad BAD) deja al lazo ciego: el PID sigue actuando sobre un PV congelado. En el simulador lo ves pasar en 5 segundos, con la alarma ISA-18.2 correcta.
- El **re-rango y los trims** de un transmisor inteligente se practican sin conectar un comunicador HART ni detener proceso.

Cada pantalla auto-explica lo que está pasando (panel contextual de explicación con la física y la norma involucradas): el simulador enseña, no solo corre.

## 2. Conceptos que se aprenden (con ejercicios concretos)

La app tiene este mapa: **Nivel 1** (macro yacimiento, tarjeta/esquema VM-101) → **Nivel 2** (P&ID del patín: slider de SP, selector de escenario, tendencia) → **Nivel 3** (faceplate FCV-101 con indicadores de barra y explicación contextual) → **Nivel 4** (modal con pestañas **Firma de válvula** y **Calibración AMS**). La barra superior tiene ▶ iniciar, velocidad ×1/×2/×5, campana de alarmas, selector de rol y selector de escenario. Los ejercicios asumen simulación iniciada (▶).

### Histéresis de la válvula (firma de válvula)
El lazo cerrado en el plano P_act vs. carrera que describe Creus Solé.
1. Nivel 1 → tarjeta VM-101 → Nivel 2 → FCV-101 → pestaña **Firma de válvula** (Nivel 4).
2. Tocá **"Ejecutar ciclo de firma (3→15→3 psi)"**: la app barre el actuador a 0.05 psi/s, manteniendo el vástago en deslizamiento casi estático.
3. **Observá** el lazo de histéresis: la rama de apertura y la de cierre no se tocan. **Debería pasar:** la separación horizontal al 50 % de carrera mide ≈ 2.4 psi = 2·F_friction (F_dyn = 1.2 psi, F_estática = 1.8 psi con los defaults). Ese ancho es exactamente la fricción de empaquetadura.

### Fricción de empaquetadura y stick-slip (vástago pegado)
1. En el Nivel 2, mové el slider de SP unos pocos puntos y dejalo quieto.
2. **Observá** el símbolo de FCV-101 en el P&ID: con el vástago en rozamiento estático aparece el distintivo **"VÁSTAGO PEGADO"** y la tendencia muestra tramos escalonados en la posición.
3. **Debería pasar:** el vástago no se mueve hasta que la presión neta supere F_estática + zona muerta; al despegar, "salta" (stick-slip). En válvulas reales esto produce oscilación del lazo y desgaste del empaquetadura.

### Zona muerta (deadband)
Banda muerta adicional en presión, configurada por parámetro (`valveDeadbandPsi`, default 0 en la UI pero soportada por el motor; ver `packages/physics/src/valve.ts`).
1. Conceptualmente: con zona muerta D, el vástago no despega mientras |P_act − P_resorte| ≤ 1.8 + D psi.
2. **Debería pasar:** la histéresis de la firma se ensancha en 2·D además de 2·F_friction (test de referencia: TC-FUN-VAL-01b).

### Cavitación / flujo ahogado (IEC 60534-2-1)
1. En la barra superior, selector de escenario → **cavitacion** (rampa de fuente 0.5 bar/s desde 100 hasta 180 bar).
2. Mirá la tendencia del caudal y el Nivel 3.
3. **Debería pasar:** cuando ΔP ≥ F_L²·(P1 − r_c·P_v), el caudal deja de seguir √ΔP y se aplana (saturado); aparece la alarma **CAVITACION_CRITICA** (prioridad 2, triángulo amarillo "2") y el panel de explicación muestra la condición con los valores del proceso sustituidos. En planta real: erosión del asiento por burbujas que colapsan aguas abajo.

### Cv y Kv
1. El mismo ejercicio de cavitación: en régimen no ahogado el caudal crece con √(ΔP/G); la pendiente la define Kv = Cv/1.156 (Cv = 50 por defecto).
2. **Debería pasar:** con Cv=50, F_L=0.9, P1=80 bar y válvula abierta, el caudal ahogado se estabiliza en ≈ 348 m³/h independientemente de cuánto bajes P2 (TC-FUN-VAL-02). Kv es el caudal en m³/h con ΔP = 1 bar; Cv, en US gpm con ΔP = 1 psi.

### Damping del transmisor
Filtro de primer orden con constante τ.
1. Nivel 4 → pestaña **Calibración AMS**, tocá el botón (i) del damping y aplicá un τ grande (p. ej. 5 s).
2. Mové el SP en el Nivel 2 y mirá la tendencia del PV.
3. **Debería pasar:** el PV sigue una exponencial: 63 % del cambio en t = τ, ~95 % en 3τ. El filtro usa la actualización exacta `y += (x−y)·(1−e^(−dt/τ))`, así que coincide con la exponencial continua a cualquier dt. Damping alto = señal linda pero lazo más torpe: en Vaca Muerta, un τ grande puede ocultar un golpe de presión real.

### Calidad de señal GOOD / BAD
1. Selector de escenario → **falla_sensor** (la falla se inyecta a los 5 s de proceso).
2. **Observá** el readout del PT-101 (Nivel 4 → Calibración AMS): calidad `BAD_SENSOR_FAILURE`, PV retenido en el último valor válido, alarma **SENSOR_FAULT** prioridad 1 (cuadrado rojo "1") en el Nivel 1.
3. **Debería pasar:** el Transducer Block marca TB_Sensor_Fault, el Resource Block pasa a FAILURE y el FB AI propaga la mala calidad sin inventar un valor. El PID sigue cerrando el lazo sobre un PV congelado: en planta real, eso es operar a ciegas hasta el mantenimiento.

### Zero Trim y Span Trim
Corrección de offset vs. corrección de ganancia (HART cmd 35 y 36).
1. Nivel 4 → Calibración AMS, botones (i) de **Zero Trim** y **Span Trim**.
2. **Debería pasar:** Zero Trim suma un offset constante en todo el rango (ej.: un pozo cerrado que lee +0.8 bar); Span Trim corrige una ganancia proporcional a la lectura (error de pendiente del sensor) y es indeterminado en lectura cero. El ejercicio mental: un offset se ve igual en todo el rango; un error de ganancia crece con la señal.

### Re-rango y turndown
1. Como **TÉCNICO** (el selector de rol de la barra superior; el OPERADOR está bloqueado por RBAC): en Calibración AMS, cambiá URV de 100 a 40 bar y aplicá.
2. **Observá** el readout: la misma presión física ahora indica un % mayor de escala (p. ej. 20 bar ⇒ 50 % de la escala 0–40).
3. **Debería pasar:** el re-rango es digital y puro: no toca la medición, solo LRV/URV del FB AI. Con span nominal 100 bar y límite de turndown 400:1, el span mínimo admisible es 0.25 bar; rangos más chicos se rechazan con error. En planta: afinar la resolución sin cambiar el transmisor.

### Lazo PID (P + I con anti-windup)
1. En el Nivel 2 mové el SP de 30 a 20 bar y mirá cómo el PID (kp = 2 %/bar, ti = 8 s) cierra la válvula hasta que el PV asiente en la consigna.
2. **Debería pasar:** la salida del PID (0–100 %) se convierte en presión de actuador 3–15 psi; la acción integral elimina el error permanente; si la salida satura (0 % o 100 %), la integral no se acumula (anti-windup por integración condicional) y al destaturar no hay sobrepaso. Nota: el PID es deliberadamente P+I, sin acción derivativa.

### Interbloqueo por roles (RBAC)
1. Logueate como **OPERADOR** e intentá aplicar una calibración.
2. **Debería pasar:** el servidor rechaza con `ERR_ACCESS_DENIED` (403), la UI lo muestra en la pestaña Calibración AMS y el rechazo queda **auditado** en el servidor (tabla `audit_log`, visible solo para INGENIERO en `GET /api/audit`). Como TÉCNICO o INGENIERO la misma operación se autoriza ("Comando AMS autorizado por el servidor"). En la realidad ISA/IEC 62443: el operario opera, el técnico configura, el ingeniero audita.

## 3. Diagrama de conexión

```
                    LAZO DE CONTROL (cerrado por el transmisor)
   SP [bar] ──► PID (P+I) ──► 0–100 % ──► posicioner I/P ──► P_act 3–15 psi
    ▲                                                                          │
    │                                                                          ▼
    └────────── PV (% de escala, AI.PV) ◄── PT-101 ◄── vasija V [bar] ◄── válvula FCV-101

 CIRCUITO DE PROCESO
 pozo/cabezal VM-101 ──►── línea de proceso ──► [ FCV-101 ]──► [ PT-101 ]──► vasija ──► colector
  (shale gas,                P1 [bar]           actuador        mide V (P2)   dV/dt =
   fuente de presión)                          neumático 3–15 psi              (Q−Qd)/C
```

Cadena de un paso del engine (`packages/physics/src/engine.ts`): SP − PV → PID → P_act (3–15 psi) → dinámica del vástago → caudal IEC 60534-2-1 → vasija (dV/dt) → transmisor TB→AI → PV del próximo tick.

## 4. Partes físicas simuladas

| Parte | Modelo |
|---|---|
| **Actuador de diafragma** | Pre-carga de resorte 5 psi, rigidez k = 8 psi por unidad de carrera, fricción de empaquetadura Coulomb con stick-slip (dinámica 1.2 psi, estática 1.5× = 1.8 psi), zona muerta adicional configurable, masa equivalente 0.0128 psi·s², amortiguamiento viscoso 0.576 psi·s (respuesta no oscilatoria). Rango 3–15 psi vía posicioner I/P. |
| **Válvula** | Característica inherente lineal o equal-percentage (relación de ajuste R = 50), Cv configurado convertido a Kv (1 Cv = 1.156 Kv). Topes de carrera 0–100 %. |
| **Fluido** | Gravedad específica G = 1 (agua), presión de vapor Pv = 0.0234 bar, factor de relación de presión crítica r_c = 0.95, factor de recuperación F_L = 0.9. Cavitación crítica cuando ΔP ≥ F_L²·(P1 − r_c·Pv). |
| **Transmisor piezoresistivo** | Arquitectura de bloques Fieldbus/HART: Resource Block (tag/fabricante/modelo/serie, device status), Transducer Block (lectura primaria con sesgo simulable, caracterización identity/√, deriva térmica residual por °C, TB_Sensor_Fault) y Function Block AI (escalamiento LRV/URV, damping, clamp 0–100 % con HIGH/LOW_LIMITED, calidad GOOD/UNCERTAIN/BAD_SENSOR_FAILURE). |
| **Vasija** | Capacidad 5 (m³/h)/(bar/s) con demanda fija de 150 m³/h; dV/dt = (Q − Q_d)/C. Presión nominal 30 bar, fuente 100 bar. |
| **PID** | P + I con anti-windup por integración condicional; kp = 2 %/bar, ti = 8 s, salida 0–100 %. |

## 5. Ecuaciones que implementa el código

Con las unidades del simulador: presión [bar] en el proceso y [psi] en el actuador, caudal [m³/h], tiempo [s].

**Balance del vástago** (`valve.ts`) — fuerzas como presión equivalente (fuerza/área del diafragma), carrera x ∈ [0,1]:

```
m·a = P_act − (P0 + k·x) − F_roz·sign(v) − c·v
```

con m = 0.0128 psi·s², P0 = 5 psi (pre-carga), k = 8 psi/unidad, c = 0.576 psi·s. Rozamiento Coulomb stick-slip: F_dyn = 0.15·k = 1.2 psi, F_estática = 1.5·F_dyn = 1.8 psi. El vástago no despega mientras |P_act − P_resorte(x)| ≤ F_estática + zona_muerta; al cruzar por velocidad cero dentro de un paso, se pega (stuck). Integración Euler semi-implícito.

**Caudal IEC 60534-2-1** (`flow.ts`), con Kv_ef = Cv/1.156·f(x):

```
Régimen no ahogado:  Q = Kv_ef·√(ΔP/G)
Cavitación crítica si ΔP ≥ F_L²·(P1 − r_c·Pv)  →  Q = Kv_ef·F_L·√((P1 − r_c·Pv)/G)
```

f(x) = x (lineal) o R^(x−1) con R = 50 (equal-percentage).

**Transmisor** (`transmitter.ts`) — cadena TB → escalado → clamp → damping:

```
% de escala = (PV − LRV)/(URV − LRV)·100        (clamped a [0,100], con HIGH/LOW_LIMITED)
Filtro de damping (primer orden, actualización exacta):  y += (x − y)·(1 − e^(−dt/τ))
```

Con TB en falla: AI.PV retiene el último valor válido y la calidad pasa a BAD_SENSOR_FAILURE. Re-rango digital con límite de turndown 400:1; zeroTrim corrige offset (`trimOffset`), spanTrim corrige ganancia (`trimGain`).

**PID** (`pid.ts`) — P + I con anti-windup:

```
error = SP − PV;   I += (kp·error·dt)/ti;   out = kp·error + I   (saturado a [0,100], sin acumular I)
```

**Vasija** (`engine.ts`):

```
dV/dt = (Q − Q_demanda)/C      ⇒      V(t+dt) = max(0, V + (Q − 150)/5·dt)
```

**Posicioner I/P**: P_act = 3 + 12·(salida PID)/100 [psi].

## 6. Escenarios simulados y su implicancia en planta real

| Escenario | Qué hace | Implicancia real |
|---|---|---|
| `normal` | Fuente constante 100 bar, vasija a 30 bar, demanda 150 m³/h. Línea base para todo diagnóstico. | Estado de operación estable. |
| `cavitacion` | Rampa de fuente 0.5 bar/s hasta 180 bar: ΔP crece hasta disparar flujo ahogado. | **Erosión por cavitación**: burbujas colapsan aguas abajo y comen el asiento/cuerpo. El caudal se satura y la válvula pierde autoridad. Alarma prioridad 2. |
| `falla_sensor` | TB_Sensor_Fault a los 5 s: calidad BAD, PV retenido. | **Lazo ciego**: el PID actúa sobre un valor congelado. En planta real el operario debe pasar a control manual y el lazo a fail-safe según diseño. Alarma prioridad 1. |
| `transitorio_p1` | Escalón de fuente a los 10 s: 100 → 140 bar. | **Golpe de presión aguas arriba** (cambio de condición del yacimiento/manifold): el transitorio pone a prueba el damping del transmisor y la velocidad del lazo. Alarma de desviación SP si |SP − PV| > 5 bar (prioridad 3). |

Las alarmas derivan del estado con codificación ISA-18.2: prioridad 1 = cuadrado rojo, 2 = triángulo amarillo, 3 = círculo azul, distinguibles también en escala de grises.

## 7. Limitaciones y simplificaciones (honestidad técnica)

- **Planta idealizada**: vasija con demanda fija (150 m³/h), temperatura ambiente constante, sin dinámica térmica ni modelo multifásico real del gas de Vaca Muerta.
- **Fricción simplificada**: modelada como presión equivalente con Coulomb estático/dinámico y stick-slip; no se modela la curva completa de Stribeck ni fricción dependiente de la posición o del tiempo en servicio.
- **Fluido simple**: gravedad específica G y presión de vapor Pv constantes; sin ecuación PVT de gas real ni efectos de temperatura en el proceso (la deriva térmica del transmisor sí existe, como parámetro).
- **PID mínimo**: solo P + I, sin acción derivativa ni estructuras avanzadas (ganancia programable, cascada, razón).
- **Escenarios discretos**: fallas inyectadas como eventos (instante fijo), no como degradación gradual de un equipo envejecido.
- **Una sola unidad**: la HMI simula un solo patín (VM-101 con FCV-101/PT-101); no hay red de válvulas ni interlocks de planta.
- **FMU sin early-return ni scheduled execution** (REQ-FUN-SIM-01/02/03 fuera de alcance por decisión): el PID corre dentro del paso de co-simulación.
- **Calibración inmediata**: los comandos AMS aplican en el siguiente tick, sin tiempo muerto de comunicación HART ni ronda del técnico.
- **Sin red ni PLC real**: el lazo cierra dentro del mismo engine; no hay módulos de E/S, retardo de red ni scan de PLC. El RBAC del backend es ilustrativo de ISA/IEC 62443 con credenciales demo (`vaca2026`).

## 8. Cómo correrlo

Requiere Node ≥ 20.19 (el repo fija Node 22 en `.nvmrc`).

```bash
npm install        # si npm 10 falla en los workspaces: npx npm@11 install
npm run dev        # HMI en http://localhost:5173 (proxy /api → API en :3001)
npm run test       # suite unitaria de todos los workspaces (Vitest)
npm run test:e2e   # recorrido e2e único (Playwright/Chromium; opt-in, levanta API :3101 + Vite)
npm run build      # type-check + build de server y web
npm run build:fmu  # compila la FMU FMI 3.0 WASM (AssemblyScript) en packages/fmu/dist/
```

Estructura del repo (npm workspaces):

```
packages/shared    contrato de mensajes worker↔UI, snapshot, escenarios
packages/physics   motor físico puro y determinista (válvula, caudal, transmisor, PID, engine)
packages/fmu       port del engine a AssemblyScript/WASM empaquetado como .fmu FMI 3.0
apps/web           HMI React de 4 niveles (worker de simulación a 100 Hz + tendencias)
apps/server        API Hono + SQLite: RBAC (3 roles), auditoría, exportación CSV/JSON
```

## 9. Referencias

- Antonio Creus Solé, *Instrumentación Industrial*, 8ª edición — firma de válvula, bloques RB/TB/FB, calibración y trims.
- IEC 60534-2-1 — ecuaciones de caudal de válvulas de control (régimen no ahogado y cavitación crítica con F_L).
- FMI 3.0 (modelica/fmi-standard) — estándar de co-simulación usado para la FMU WASM; esquema XSD 3.0.2.
- ANSI/ISA-101.01-2015 — HMI de alto rendimiento (gris de proceso, color reservado a alarmas).
- ISA-18.2 — gestión de alarmas (prioridades y símbolos).
- ISA/IEC 62443 — roles y segregación de funciones (operador/técnico/ingeniero).

Los requerimientos y casos de prueba formales viven en `requerimientos-simulador-vaca-muerta.md` (documento fuente) y `docs/requerimientos.md` (REQ/TC agregados por épica); el historial en `CHANGELOG.md`.
