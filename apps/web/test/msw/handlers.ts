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
export const exercisesFixture: Exercise[] = [
  {
    id: 1,
    name: 'ベンチプレス',
    muscleGroup: 'chest',
    createdAt: '2026-09-01',
  },
  { id: 2, name: 'スクワット', muscleGroup: 'legs', createdAt: '2026-09-01' },
]

export const workoutFixture: Workout = {
  id: 10,
  performedOn: '2026-09-20',
  createdAt: '2026-09-20 09:00:00',
  sets: [],
}

export const lastSetsFixture: LastSetsResult = {
  workoutId: 9,
  performedOn: '2026-09-13',
  sets: [
    { id: 1, setOrder: 1, weightKg: 60, reps: 10 },
    { id: 2, setOrder: 2, weightKg: 65, reps: 8 },
  ],
}

export const workoutsFixture: WorkoutSummary[] = [
  { id: 10, performedOn: '2026-09-20', setCount: 3 },
  { id: 9, performedOn: '2026-09-13', setCount: 5 },
]

export const handlers = [
  http.get('/api/exercises', () => HttpResponse.json(exercisesFixture)),

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

  // 楽観的更新を観察できるよう、わざと応答を遅らせる
  http.post('/api/workouts/:id/sets', async ({ request }) => {
    const body = (await request.json()) as { weightKg: number; reps: number }
    await delay(100)
    return HttpResponse.json(
      {
        id: 99,
        workoutId: 10,
        exerciseId: 1,
        setOrder: 1,
        weightKg: body.weightKg,
        reps: body.reps,
        createdAt: '2026-09-20 10:00:00',
      },
      { status: 201 },
    )
  }),
]
