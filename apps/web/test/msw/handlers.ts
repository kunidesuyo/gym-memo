import { delay, HttpResponse, http } from 'msw'
import type {
  Exercise,
  LastSetsResult,
  Workout,
  WorkoutSummary,
} from '../../src/api/hooks'

/**
 * モックのレスポンス型を実際の API の推論型に縛る。
 * API 側のレスポンス形を変えてここを直し忘れると、
 * テストが通ってしまう前にコンパイルエラーになる。
 */
export const BENCH_ID = '01a0bf17-b376-7779-828a-c36eec5b701c'
export const SQUAT_ID = '01a0bf17-b376-7779-828a-e1cdd8f5e8ea'
export const WORKOUT_ID = '01a0bf20-0000-7000-8000-000000000010'

export const exercisesFixture: Exercise[] = [
  {
    id: '01a0bf17-b376-7779-828a-c36eec5b701c',
    name: 'ベンチプレス',
    category: 'push',
    muscleGroup: 'chest',
    createdAt: '2026-09-01',
  },
  {
    id: '01a0bf17-b376-7779-828a-e1cdd8f5e8ea',
    name: 'スクワット',
    category: 'legs',
    muscleGroup: 'quads',
    createdAt: '2026-09-01',
  },
]

export const workoutFixture: Workout = {
  id: '01a0bf20-0000-7000-8000-000000000010',
  performedOn: '2026-09-20',
  createdAt: '2026-09-20 09:00:00',
  sets: [],
}

/** 編集・削除のテスト用。既にセットが入っているセッション。 */
export const workoutWithSetsFixture: Workout = {
  id: WORKOUT_ID,
  performedOn: '2026-09-20',
  createdAt: '2026-09-20 09:00:00',
  sets: [
    {
      id: 'set-1',
      exerciseId: BENCH_ID,
      exerciseName: 'ベンチプレス',
      setOrder: 1,
      weightKg: 60,
      reps: 10,
      note: null,
    },
    {
      id: 'set-2',
      exerciseId: BENCH_ID,
      exerciseName: 'ベンチプレス',
      setOrder: 2,
      weightKg: 65,
      reps: 8,
      note: null,
    },
  ],
}

export const lastSetsFixture: LastSetsResult = {
  workoutId: '01a0bf19-0000-7000-8000-000000000009',
  performedOn: '2026-09-13',
  sets: [
    { id: 's1', setOrder: 1, weightKg: 60, reps: 10, note: null },
    { id: 's2', setOrder: 2, weightKg: 65, reps: 8, note: 'ウォームアップ' },
  ],
}

export const workoutsFixture: WorkoutSummary[] = [
  {
    id: '01a0bf20-0000-7000-8000-000000000010',
    performedOn: '2026-09-20',
    setCount: 3,
  },
  {
    id: '01a0bf19-0000-7000-8000-000000000009',
    performedOn: '2026-09-13',
    setCount: 5,
  },
]

export const handlers = [
  http.get('/api/exercises', () => HttpResponse.json(exercisesFixture)),

  http.post('/api/exercises', async ({ request }) => {
    const body = (await request.json()) as Omit<Exercise, 'id' | 'createdAt'>
    return HttpResponse.json(
      {
        id: '01a0bf22-0000-7000-8000-000000000003',
        createdAt: '2026-09-20',
        ...body,
      },
      { status: 201 },
    )
  }),

  http.patch('/api/exercises/:id', async ({ request, params }) => {
    const body = (await request.json()) as Omit<Exercise, 'id' | 'createdAt'>
    return HttpResponse.json({
      id: String(params.id),
      createdAt: '2026-09-01',
      ...body,
    })
  }),

  http.delete(
    '/api/exercises/:id',
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.get('/api/workouts', () => HttpResponse.json(workoutsFixture)),

  http.post('/api/workouts', async ({ request }) => {
    const body = (await request.json()) as { performedOn: string }
    return HttpResponse.json(
      {
        id: 11,
        performedOn: body.performedOn,
        createdAt: '2026-09-20 10:00:00',
      },
      { status: 201 },
    )
  }),

  http.get('/api/workouts/:id', () => HttpResponse.json(workoutFixture)),

  http.get('/api/exercises/:id/last-sets', () =>
    HttpResponse.json(lastSetsFixture),
  ),

  http.patch('/api/sets/:id', async ({ request, params }) => {
    const body = (await request.json()) as {
      weightKg: number
      reps: number
      note?: string | null
    }
    await delay(50)
    return HttpResponse.json({
      id: String(params.id),
      workoutId: WORKOUT_ID,
      exerciseId: BENCH_ID,
      setOrder: 1,
      createdAt: '2026-09-20 10:00:00',
      ...body,
      note: body.note ?? null,
    })
  }),

  http.delete('/api/sets/:id', async () => {
    await delay(50)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(
    '/api/workouts/:id',
    () => new HttpResponse(null, { status: 204 }),
  ),

  // 楽観的更新を観察できるよう、わざと応答を遅らせる
  http.post('/api/workouts/:id/sets', async ({ request }) => {
    const body = (await request.json()) as { weightKg: number; reps: number }
    await delay(100)
    return HttpResponse.json(
      {
        id: '01a0bf23-0000-7000-8000-000000000099',
        workoutId: WORKOUT_ID,
        exerciseId: BENCH_ID,
        setOrder: 1,
        weightKg: body.weightKg,
        reps: body.reps,
        note: null,
        createdAt: '2026-09-20 10:00:00',
      },
      { status: 201 },
    )
  }),
]
