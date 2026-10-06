import pool from '../config/db.js'

const INTERVALO_MINUTOS = 30

export async function obtenerDisponibilidad({
    fecha,
    duracionMinutos,
}) {
    if (!fecha) {
        throw new Error('La fecha es obligatoria')
    }

    if (
        !duracionMinutos ||
        Number(duracionMinutos) <= 0
    ) {
        throw new Error(
            'La duración debe ser mayor a cero',
        )
    }

    const duracion =
        Number(duracionMinutos)

    const diaSemana =
        obtenerDiaSemana(fecha)

    const horario =
        await obtenerHorarioDelDia(
            diaSemana,
        )

    if (!horario) {
        return {
            fecha,
            disponible: false,
            motivo:
                'No hay horario de atención para este día.',
            horarios: [],
        }
    }

    const bloqueos =
        await obtenerBloqueosFecha(
            fecha,
        )

    const bloqueoDiaCompleto =
        bloqueos.some(
            (bloqueo) =>
                !bloqueo.hora_inicio &&
                !bloqueo.hora_fin,
        )

    if (bloqueoDiaCompleto) {
        return {
            fecha,
            disponible: false,
            motivo:
                'La fecha se encuentra bloqueada.',
            horarios: [],
        }
    }

    const citas =
        await obtenerCitasOcupadas(
            fecha,
        )

    const inicioJornada =
        horaAMinutos(
            horario.hora_inicio,
        )

    const finJornada =
        horaAMinutos(
            horario.hora_fin,
        )

    const horariosDisponibles = []

    for (
        let inicio = inicioJornada;
        inicio + duracion <= finJornada;
        inicio += INTERVALO_MINUTOS
    ) {
        const fin =
            inicio + duracion

        const chocaConBloqueo =
            bloqueos.some(
                (bloqueo) => {
                    if (
                        !bloqueo.hora_inicio ||
                        !bloqueo.hora_fin
                    ) {
                        return false
                    }

                    const bloqueoInicio =
                        horaAMinutos(
                            bloqueo.hora_inicio,
                        )

                    const bloqueoFin =
                        horaAMinutos(
                            bloqueo.hora_fin,
                        )

                    return hayTraslape(
                        inicio,
                        fin,
                        bloqueoInicio,
                        bloqueoFin,
                    )
                },
            )

        if (chocaConBloqueo) {
            continue
        }

        const chocaConCita =
            citas.some(
                (cita) => {
                    const citaInicio =
                        horaAMinutos(
                            cita.hora_inicio,
                        )

                    const citaFin =
                        horaAMinutos(
                            cita.hora_fin,
                        )

                    return hayTraslape(
                        inicio,
                        fin,
                        citaInicio,
                        citaFin,
                    )
                },
            )

        if (chocaConCita) {
            continue
        }

        horariosDisponibles.push({
            hora_inicio:
                minutosAHora(
                    inicio,
                ),
            hora_fin:
                minutosAHora(
                    fin,
                ),
        })
    }

    return {
        fecha,
        disponible:
            horariosDisponibles.length > 0,
        horario_atencion: {
            hora_inicio:
                normalizarHora(
                    horario.hora_inicio,
                ),
            hora_fin:
                normalizarHora(
                    horario.hora_fin,
                ),
        },
        duracion_minutos:
            duracion,
        horarios:
            horariosDisponibles,
    }
}

async function obtenerHorarioDelDia(
    diaSemana,
) {
    const resultado =
        await pool.query(
            `
                SELECT
                    id_horario,
                    dia_semana,
                    hora_inicio,
                    hora_fin
                FROM horarios_atencion
                WHERE dia_semana = $1
                  AND activo = TRUE
                ORDER BY hora_inicio
                LIMIT 1
            `,
            [
                diaSemana,
            ],
        )

    if (
        resultado.rowCount === 0
    ) {
        return null
    }

    return resultado.rows[0]
}

async function obtenerBloqueosFecha(
    fecha,
) {
    const resultado =
        await pool.query(
            `
                SELECT
                    id_bloqueo,
                    fecha,
                    hora_inicio,
                    hora_fin,
                    motivo
                FROM bloqueos_horario
                WHERE fecha = $1
                  AND activo = TRUE
                ORDER BY hora_inicio NULLS FIRST
            `,
            [
                fecha,
            ],
        )

    return resultado.rows
}

async function obtenerCitasOcupadas(
    fecha,
) {
    const resultado =
        await pool.query(
            `
                SELECT
                    id_cita,

                    COALESCE(
                        hora_inicio_confirmada,
                        hora_inicio_solicitada
                    ) AS hora_inicio,

                    COALESCE(
                        hora_fin_confirmada,
                        hora_fin_solicitada
                    ) AS hora_fin

                FROM citas
                WHERE
                    COALESCE(
                        fecha_confirmada,
                        fecha_solicitada
                    ) = $1

                    AND estado NOT IN (
                        'RECHAZADA',
                        'CANCELADA_CLIENTE',
                        'CANCELADA_ADMIN',
                        'NO_ASISTIO'
                    )
            `,
            [
                fecha,
            ],
        )

    return resultado.rows
}

function obtenerDiaSemana(
    fecha,
) {
    const [
        anio,
        mes,
        dia,
    ] = fecha
        .split('-')
        .map(Number)

    const fechaLocal =
        new Date(
            anio,
            mes - 1,
            dia,
        )

    return fechaLocal.getDay()
}

function horaAMinutos(
    hora,
) {
    if (!hora) {
        return 0
    }

    const [
        horas,
        minutos,
    ] = String(hora)
        .split(':')
        .map(Number)

    return (
        horas * 60 +
        minutos
    )
}

function minutosAHora(
    minutosTotales,
) {
    const horas =
        Math.floor(
            minutosTotales / 60,
        )

    const minutos =
        minutosTotales % 60

    return `${String(horas).padStart(
        2,
        '0',
    )}:${String(minutos).padStart(
        2,
        '0',
    )}`
}

function normalizarHora(
    hora,
) {
    if (!hora) {
        return null
    }

    return String(hora)
        .substring(0, 5)
}

function hayTraslape(
    inicioA,
    finA,
    inicioB,
    finB,
) {
    return (
        inicioA < finB &&
        finA > inicioB
    )
}