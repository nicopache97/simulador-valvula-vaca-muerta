/** Roles de usuario del sistema (REQ-NFUN-SEC-01, ISA/IEC 62443). */
export type UserRole = 'OPERATOR' | 'TECHNICIAN' | 'ENGINEER'

export const USER_ROLES: readonly UserRole[] = ['OPERATOR', 'TECHNICIAN', 'ENGINEER']

/** Escenarios de proceso (EP-03). */
export type SimulationScenario = 'normal' | 'cavitacion' | 'falla_sensor' | 'transitorio_p1'

export const SIMULATION_SCENARIOS: readonly SimulationScenario[] = [
  'normal',
  'cavitacion',
  'falla_sensor',
  'transitorio_p1',
]

/**
 * Configuración serializable del engine (mensaje `init` del worker, EP-03).
 * Todos los campos son opcionales y confluyen en los defaults del engine
 * (`@sim/physics`). Tipos planos (primitivos) para garantizar que pasa por
 * `postMessage` sin transformaciones.
 */
export interface SimulationConfig {
  /** Paso de integración [s]; default 0.01 (REQ-GEN-01: Δt ≤ 10 ms). */
  readonly dt?: number
  /** Escenario activo; default 'normal'. */
  readonly scenario?: SimulationScenario
  /** Consigna inicial del PID [bar]; default = presión nominal de la vasija. */
  readonly spBar?: number
  /** Lado del que el transmisor cierra el lazo (presión que mide el PV). */
  readonly measure?: 'upstream' | 'downstream'
  // Proceso
  /** Presión constante de la fuente aguas arriba de la válvula [bar]; default 100. */
  readonly supplyBar?: number
  /** Presión nominal inicial de la vasija controlada [bar]; default 30 (P2). */
  readonly vesselNominalBar?: number
  /** Demanda fija aguas abajo de la vasija [m³/h]; default 150. */
  readonly qDemandNominal?: number
  /** Capacidad de la vasija [(m³/h)/(bar/s)]; default 5. */
  readonly capacity?: number
  // Válvula
  /** Fricción de empaquetadura como fracción del empuje de resorte; default 0.15. */
  readonly valveFrictionFraction?: number
  /** Zona muerta adicional [psi]; default 0. */
  readonly valveDeadbandPsi?: number
  // Hidráulica (IEC 60534-2-1)
  /** Coeficiente Cv [US gpm/√psi]; default 50. */
  readonly cv?: number
  /** Factor de recuperación de presión F_L; default 0.9. */
  readonly fl?: number
  // Transmisor
  /** Constante de tiempo del damping [s]; default 0. */
  readonly txTau?: number
  // PID
  /** Ganancia proporcional [%/bar]; default 2. */
  readonly kp?: number
  /** Tiempo integral [s]; default 8. */
  readonly ti?: number
  // Parámetros de escenario
  /** `falla_sensor`: instante de inyección de TB_Sensor_Fault [s]; default 5. */
  readonly faultAtSec?: number
  /** `transitorio_p1`: instante del escalón en la presión de fuente [s]; default 10. */
  readonly stepAtSec?: number
  /** `transitorio_p1`: presión de fuente tras el escalón [bar]; default 140. */
  readonly stepToBar?: number
  /** `cavitacion`: rampa de presión de fuente [bar/s]; default 0.5. */
  readonly rampBarPerSec?: number
  /** `cavitacion`: presión de fuente final de la rampa [bar]; default 180. */
  readonly rampToBar?: number
}

/** Calidad de la señal en el snapshot (espejo de `SignalQuality` de @sim/physics). */
export type SimSignalQuality = 'GOOD' | 'UNCERTAIN' | 'BAD_SENSOR_FAILURE'

/** Condición de alarma activa (ISA-18.2: prioridad 1 crítica … 3 baja). */
export interface SimAlarm {
  readonly code: 'CAVITACION_CRITICA' | 'SENSOR_FAULT' | 'DESVIACION_SP'
  readonly priority: 1 | 2 | 3
  readonly message: string
}

/**
 * Snapshot serializable de un tick (worker → UI). JSON plano: estructurado,
 * inspeccionable en DevTools y suficiente para ~15 floats a 100 Hz
 * (Float32Array se justificaría si el ancho de banda fuera problema medido).
 */
export interface SimSnapshot {
  /** Reloj de proceso [s]. */
  readonly t: number
  /** Paso de integración usado [s]. */
  readonly dt: number
  /** Consigna del PID [bar]. */
  readonly spBar: number
  /** PV del transmisor [bar] (unidades de ingeniería). */
  readonly pvBar: number
  /** PV en % de escala (AI.PV de 0 a 100). */
  readonly pvPercent: number
  /** LRV configurado del FB AI [bar] (re-rango vía calibrate, REQ-FUN-TRM-02). */
  readonly txLrvBar: number
  /** URV configurado del FB AI [bar]. */
  readonly txUrvBar: number
  readonly quality: SimSignalQuality
  /** Posición del vástago [% de carrera]. */
  readonly valveOpeningPercent: number
  /** true mientras el vástago está pegado (stick-slip). */
  readonly valveStuck: boolean
  /** Presión del actuador [psi]. */
  readonly pActPsi: number
  /** Presión aguas arriba [bar]. */
  readonly p1Bar: number
  /** Presión aguas abajo [bar]. */
  readonly p2Bar: number
  /** Caudal [m³/h]. */
  readonly flowM3h: number
  /** true si el régimen es ahogado (cavitación crítica). */
  readonly choked: boolean
  /** ΔP de inicio de cavitación [bar]: F_L²·(P1 − r_c·P_v). */
  readonly dpChokedBar: number
  /** Salida del PID [% de escala del actuador]. */
  readonly pidOutPercent: number
  readonly scenario: SimulationScenario
  readonly alarms: readonly SimAlarm[]
}

/** Comandos UI → worker. */
export interface SimInitCommand {
  readonly type: 'init'
  readonly config: SimulationConfig
}
export interface SimStartCommand {
  readonly type: 'start'
}
export interface SimPauseCommand {
  readonly type: 'pause'
}
export interface SimResetCommand {
  readonly type: 'reset'
}
export interface SimSetSpCommand {
  readonly type: 'setSp'
  readonly spBar: number
}
export interface SimSetScenarioCommand {
  readonly type: 'setScenario'
  readonly scenario: SimulationScenario
}
export interface SimExportRequestCommand {
  readonly type: 'exportRequest'
  readonly requestId: string
}
/** Multiplicador de velocidad de la simulación (EP-04, barra superior). */
export type SimSpeed = 1 | 2 | 5
export interface SimSetSpeedCommand {
  readonly type: 'setSpeed'
  readonly speed: SimSpeed
}
/**
 * Comandos de campo tipo AMS/HART sobre el transmisor vivo (EP-04, Nivel 4).
 * Campos ausentes = sin cambio. Los rechazos del transmisor (p. ej. turndown
 * superado en `setRange`) se reportan como evento `error`.
 */
export interface SimCalibrateCommand {
  readonly type: 'calibrate'
  /** Re-rango digital LRV [bar]. Requiere `urv` coherente. */
  readonly lrv?: number
  /** Re-rango digital URV [bar]. */
  readonly urv?: number
  /** Damping del FB AI (τ) [s]. */
  readonly tau?: number
  /** Zero Trim: patrón aplicado al proceso [bar] (HART cmd 35). */
  readonly zeroTrim?: number
  /** Span Trim: patrón aplicado al proceso [bar] (HART cmd 36). */
  readonly spanTrim?: number
}

export type SimCommand =
  | SimInitCommand
  | SimStartCommand
  | SimPauseCommand
  | SimResetCommand
  | SimSetSpCommand
  | SimSetScenarioCommand
  | SimExportRequestCommand
  | SimSetSpeedCommand
  | SimCalibrateCommand

/** Eventos worker → UI. */
export type SimEvent =
  | { readonly type: 'ready' }
  | {
      readonly type: 'tick'
      readonly snapshot: SimSnapshot
      /** Tiempo real de cálculo del paso [ms] (métrica REQ-NFUN-PERF-01). */
      readonly computeMs: number
      /** Media móvil del tiempo de cálculo [ms]. */
      readonly avgComputeMs: number
    }
  | { readonly type: 'exported'; readonly requestId: string; readonly csv: string }
  | { readonly type: 'error'; readonly message: string }
