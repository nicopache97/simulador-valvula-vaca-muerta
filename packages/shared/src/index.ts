/** Roles de usuario del sistema (REQ-NFUN-SEC-01, ISA/IEC 62443). */
export type UserRole = 'OPERATOR' | 'TECHNICIAN' | 'ENGINEER'

export const USER_ROLES: readonly UserRole[] = ['OPERATOR', 'TECHNICIAN', 'ENGINEER']
