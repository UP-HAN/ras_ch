import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassView, TeacherView } from '@server-types/api';
import { useState, type FormEvent } from 'react';
import { adminApi, type GradeGroup } from '@/api/admin';
import { errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input } from '@/components/ui';

/** ADM-01: 학년도·반·교사 관리, 교사 역할 지정(승인 권한·학년군 지도교사) */
export function SchoolSettingsPage() {
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ['admin', 'years'], queryFn: adminApi.schoolYears });
  const classes = useQuery({ queryKey: ['admin', 'classes'], queryFn: adminApi.classes });
  const teachers = useQuery({ queryKey: ['admin', 'teachers'], queryFn: adminApi.teachers });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const fail = (e: unknown) => setErr(errorMessage(e));

  return (
    <>
      <PageHeader title="학교 설정" description="학년도, 반, 교사 계정과 역할을 관리해요." />
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {err && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {err}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <YearsCard
          years={years.data ?? []}
          onDone={(m) => {
            setMsg(m);
            setErr(null);
            refresh();
          }}
          onError={fail}
        />
        <TeachersCard
          teachers={teachers.data ?? []}
          onDone={(m) => {
            setMsg(m);
            setErr(null);
            refresh();
          }}
          onError={fail}
        />
        <div className="xl:col-span-2">
          <ClassesCard
            classes={classes.data ?? []}
            teachers={teachers.data ?? []}
            onDone={(m) => {
              setMsg(m);
              setErr(null);
              refresh();
            }}
            onError={fail}
          />
        </div>
      </div>
    </>
  );
}

type Cb = { onDone: (m: string) => void; onError: (e: unknown) => void };

function YearsCard({
  years,
  onDone,
  onError,
}: { years: Awaited<ReturnType<typeof adminApi.schoolYears>> } & Cb) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const create = useMutation({
    mutationFn: () =>
      adminApi.createSchoolYear({
        year: Number(year),
        startDate: `${year}-03-01`,
        endDate: `${Number(year) + 1}-02-28`,
        makeCurrent: years.length === 0,
      }),
    onSuccess: () => onDone(`${year}학년도를 만들었어요.`),
    onError,
  });
  const setCurrent = useMutation({
    mutationFn: adminApi.setCurrentSchoolYear,
    onSuccess: () => onDone('현재 학년도를 바꿨어요.'),
    onError,
  });
  return (
    <Card title="학년도">
      <ul className="mb-3 space-y-1">
        {years.map((y) => (
          <li key={y.id} className="flex items-center justify-between text-base">
            <span>
              {y.year}학년도{' '}
              <span className="text-ink-muted">
                ({y.startDate} ~ {y.endDate})
              </span>{' '}
              {y.isCurrent && <Badge tone="success">현재</Badge>}
            </span>
            {!y.isCurrent && (
              <Button variant="ghost" onClick={() => setCurrent.mutate(y.id)}>
                현재로
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          label="새 학년도"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-40"
        />
        <Button type="submit" variant="secondary" loading={create.isPending}>
          만들기
        </Button>
      </form>
    </Card>
  );
}

function TeachersCard({ teachers, onDone, onError }: { teachers: TeacherView[] } & Cb) {
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ loginId: string; pw: string } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      adminApi.createTeacher({
        loginId,
        name,
        isApprover: false,
        advisorGradeGroup: null,
        role: 'teacher',
      }),
    onSuccess: (r) => {
      setCreated({ loginId, pw: r.initialPassword });
      setLoginId('');
      setName('');
      onDone('교사 계정을 만들었어요.');
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => onDone('교사 계정을 지웠어요.'),
    onError,
  });
  const roles = useMutation({
    mutationFn: (t: { id: number; isApprover: boolean; advisorGradeGroup: GradeGroup | null }) =>
      adminApi.setTeacherRoles(t.id, {
        isApprover: t.isApprover,
        advisorGradeGroup: t.advisorGradeGroup,
      }),
    onSuccess: () => onDone('교사 역할을 바꿨어요.'),
    onError,
  });

  return (
    <Card title="교사">
      {created && (
        <p className="mb-3 rounded-md bg-accent-50 p-3 text-base">
          {created.loginId} 의 초기 비밀번호: <code className="font-extrabold">{created.pw}</code>{' '}
          (지금만 보여요)
        </p>
      )}
      <table className="mb-3 w-full text-left text-base">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th className="py-1 pr-2">이름</th>
            <th className="py-1 pr-2">ID</th>
            <th className="py-1 pr-2">승인 권한</th>
            <th className="py-1 pr-2">학년군 지도</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => (
            <tr key={t.id} className="border-b border-line/60">
              <td className="py-1 pr-2 font-semibold">
                {t.name} {t.role === 'admin' && <Badge tone="primary">관리자</Badge>}
              </td>
              <td className="py-1 pr-2 text-ink-muted">{t.loginId}</td>
              <td className="py-1 pr-2">
                <label className="flex min-h-tap items-center gap-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={t.isApprover || t.role === 'admin'}
                    disabled={t.role === 'admin'}
                    onChange={(e) =>
                      roles.mutate({
                        id: t.id,
                        isApprover: e.target.checked,
                        advisorGradeGroup: (t.advisorGradeGroup as GradeGroup | null) ?? null,
                      })
                    }
                  />
                  승인
                </label>
              </td>
              <td className="py-1">
                <select
                  aria-label={`${t.name} 학년군 지도`}
                  className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                  value={t.advisorGradeGroup ?? ''}
                  onChange={(e) =>
                    roles.mutate({
                      id: t.id,
                      isApprover: t.isApprover,
                      advisorGradeGroup: (e.target.value || null) as GradeGroup | null,
                    })
                  }
                >
                  <option value="">없음</option>
                  <option value="3-4">3-4학년군</option>
                  <option value="5-6">5-6학년군</option>
                </select>
              </td>
              <td className="py-1">
                {t.role !== 'admin' && (
                  <Button
                    variant="ghost"
                    loading={remove.isPending && remove.variables === t.id}
                    onClick={() =>
                      window.confirm(
                        `${t.name} 교사 계정을 지울까요? 승인 기록 등 활동이 있으면 지워지지 않아요.`,
                      ) && remove.mutate(t.id)
                    }
                  >
                    삭제
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          label="교사 ID(이메일)"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoCapitalize="none"
        />
        <Input label="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" loading={create.isPending}>
          교사 추가
        </Button>
      </form>
    </Card>
  );
}

function ClassesCard({
  classes,
  teachers,
  onDone,
  onError,
}: { classes: ClassView[]; teachers: TeacherView[] } & Cb) {
  const [grade, setGrade] = useState('3');
  const [classNo, setClassNo] = useState('1');
  const create = useMutation({
    mutationFn: () => adminApi.createClass({ grade: Number(grade), classNo: Number(classNo) }),
    onSuccess: () => onDone(`${grade}-${classNo} 반을 만들었어요.`),
    onError,
  });
  const homeroom = useMutation({
    mutationFn: (v: { classId: number; teacherId: number | null }) =>
      adminApi.setHomeroom(v.classId, v.teacherId),
    onSuccess: () => onDone('담임을 바꿨어요.'),
    onError,
  });
  const assign = useMutation({
    mutationFn: (v: { classId: number; teacherIds: number[] }) =>
      adminApi.setClassTeachers(v.classId, v.teacherIds),
    onSuccess: () => onDone('반 배정 교사를 바꿨어요.'),
    onError,
  });

  return (
    <Card title="반">
      <div className="overflow-x-auto">
        <table className="mb-3 w-full text-left text-base">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-1 pr-2">반</th>
              <th className="py-1 pr-2">학생</th>
              <th className="py-1 pr-2">담임</th>
              <th className="py-1">배정 교사(여러 명 가능)</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id} className="border-b border-line/60 align-top">
                <td className="py-2 pr-2 font-semibold">{c.name}</td>
                <td className="py-2 pr-2">{c.studentCount}명</td>
                <td className="py-2 pr-2">
                  <select
                    aria-label={`${c.name} 담임`}
                    className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                    value={c.homeroomTeacherId ?? ''}
                    onChange={(e) =>
                      homeroom.mutate({
                        classId: c.id,
                        teacherId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">없음</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {teachers.map((t) => {
                      const on = c.teacherIds.includes(t.id);
                      return (
                        <label key={t.id} className="flex min-h-tap items-center gap-1">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={on}
                            onChange={() =>
                              assign.mutate({
                                classId: c.id,
                                teacherIds: on
                                  ? c.teacherIds.filter((id) => id !== t.id)
                                  : [...c.teacherIds, t.id],
                              })
                            }
                          />
                          {t.name}
                        </label>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Input
          label="학년"
          type="number"
          min={3}
          max={6}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-28"
        />
        <Input
          label="반"
          type="number"
          min={1}
          max={30}
          value={classNo}
          onChange={(e) => setClassNo(e.target.value)}
          className="w-28"
        />
        <Button type="submit" variant="secondary" loading={create.isPending}>
          반 만들기
        </Button>
      </form>
    </Card>
  );
}
