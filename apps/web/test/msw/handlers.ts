import type { NewExercise } from 'api/schema/exercise'
import { delay, HttpResponse, http } from 'msw'
import type {
  Exercise,
  ExerciseHistory,
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
export const ABS_ID = '01a0bf17-b376-7779-828a-000000000005'
export const WORKOUT_ID = '01a0bf20-0000-7000-8000-000000000010'

// サーバーが返す並び（分割 → displayOrder → 名前）のままにしてある。
// msw はこの配列をそのまま返すので、ここが崩れていると画面のテストが嘘になる。
export const exercisesFixture: Exercise[] = [
  {
    id: BENCH_ID,
    name: 'ベンチプレス',
    category: 'push',
    muscleGroup: 'chest',
    createdAt: '2026-09-01',
    displayOrder: 10,
  },
  {
    id: '01a0bf17-b376-7779-828a-000000000004',
    name: 'サイドレイズ',
    category: 'push',
    muscleGroup: 'shoulders',
    createdAt: '2026-09-01',
    displayOrder: 20,
  },
  {
    id: '01a0bf17-b376-7779-828a-000000000003',
    name: 'ラットプルダウン',
    category: 'pull',
    muscleGroup: 'back',
    createdAt: '2026-09-01',
    displayOrder: 10,
  },
  {
    id: SQUAT_ID,
    name: 'スクワット',
    category: 'legs',
    muscleGroup: 'quads',
    createdAt: '2026-09-01',
    displayOrder: 10,
  },
  {
    id: ABS_ID,
    name: '腹筋',
    category: 'other',
    muscleGroup: 'other',
    createdAt: '2026-09-01',
    displayOrder: 10,
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
      isSuccessful: true,
      isMainSet: false,
      note: null,
    },
    {
      id: 'set-2',
      exerciseId: BENCH_ID,
      exerciseName: 'ベンチプレス',
      setOrder: 2,
      weightKg: 65,
      reps: 8,
      isSuccessful: true,
      isMainSet: true,
      note: null,
    },
  ],
}

export const historyFixture: ExerciseHistory = {
  exercise: {
    id: BENCH_ID,
    name: 'ベンチプレス',
    category: 'push',
    muscleGroup: 'chest',
    displayOrder: 10,
    createdAt: '2026-09-01',
  },
  sessions: [
    {
      workoutId: WORKOUT_ID,
      performedOn: '2026-09-20',
      sets: [
        {
          id: 'h1',
          setOrder: 1,
          weightKg: 70,
          reps: 6,
          isSuccessful: true,
          isMainSet: true,
          note: null,
        },
      ],
    },
    {
      workoutId: '01a0bf19-0000-7000-8000-000000000009',
      performedOn: '2026-09-13',
      sets: [
        // 60kg がウォームアップ / 65kg がメインセット。
        // 他のフィクスチャ（workoutWithSetsFixture / lastSetsFixture）と揃えてある。
        {
          id: 'h2',
          setOrder: 1,
          weightKg: 60,
          reps: 10,
          isSuccessful: true,
          isMainSet: false,
          note: 'シート3段目',
        },
        {
          id: 'h3',
          setOrder: 2,
          weightKg: 65,
          reps: 8,
          isSuccessful: true,
          isMainSet: true,
          note: null,
        },
      ],
    },
  ],
}

export const lastSetsFixture: LastSetsResult = {
  workoutId: '01a0bf19-0000-7000-8000-000000000009',
  performedOn: '2026-09-13',
  sets: [
    // 60kg がウォームアップ / 65kg がメインセット。
    {
      id: 's1',
      setOrder: 1,
      weightKg: 60,
      reps: 10,
      isSuccessful: true,
      isMainSet: false,
      note: 'ウォームアップ',
    },
    {
      id: 's2',
      setOrder: 2,
      weightKg: 65,
      reps: 8,
      isSuccessful: true,
      isMainSet: true,
      note: null,
    },
  ],
}

/**
 * copy-last が返すセット。lastSetsFixture を今日に複製した結果にあたるので、
 * workoutWithSetsFixture.sets と同じ内容にしてある
 * （コピー後の GET が返すものと食い違わせない）。
 */
export const copiedSetsFixture = workoutWithSetsFixture.sets

export const workoutsFixture: WorkoutSummary[] = [
  { id: '01a0bf20-0000-7000-8000-000000000010', performedOn: '2026-09-20' },
  { id: '01a0bf19-0000-7000-8000-000000000009', performedOn: '2026-09-13' },
]

export const handlers = [
  http.get('/api/exercises', () => HttpResponse.json(exercisesFixture)),

  http.post('/api/exercises', async ({ request }) => {
    const body = (await request.json()) as NewExercise
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
    const body = (await request.json()) as NewExercise
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
        id: '01a0bf21-0000-7000-8000-000000000011',
        performedOn: body.performedOn,
        createdAt: '2026-09-20 10:00:00',
      },
      { status: 201 },
    )
  }),

  http.get('/api/workouts/:id', () => HttpResponse.json(workoutFixture)),

  http.get('/api/exercises/:id/history', () =>
    HttpResponse.json(historyFixture),
  ),

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
      isSuccessful: true,
      isMainSet: true,
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

  // 前回の記録をまとめて複製する。既定では lastSetsFixture と同じ内容を返す。
  http.post('/api/workouts/:id/sets/copy-last', async () => {
    await delay(50)
    return HttpResponse.json(copiedSetsFixture, { status: 201 })
  }),

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
        isSuccessful: true,
        isMainSet: true,
        note: null,
        createdAt: '2026-09-20 10:00:00',
      },
      { status: 201 },
    )
  }),
]
