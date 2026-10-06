import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassView, TeacherView } from '@server-types/api';
import { useState, type FormEvent } from 'react';
import { adminApi, type GradeGroup } from '@/api/admin';
import { errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/components/ui';

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

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
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
  // 교사 비밀번호 초기화 (AUTH-04 보강): 임시 비밀번호는 지금 한 번만 보여 준다
  const [resettingPw, setResettingPw] = useState<TeacherView | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);
  const resetPw = useMutation({
    mutationFn: (id: number) => adminApi.resetTeacherPassword(id),
    onSuccess: (r) => {
      setTempPw({ name: resettingPw?.name ?? '', pw: r.tempPassword });
      setResettingPw(null);
      onDone('교사 비밀번호를 초기화했어요.');
    },
    onError: (e) => {
      setResettingPw(null);
      onError(e);
    },
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
      {tempPw && (
        <p className="mb-3 rounded-md bg-accent-50 p-3 text-base">
          <strong>{tempPw.name}</strong> 선생님의 임시 비밀번호는{' '}
          <code className="font-extrabold">{tempPw.pw}</code> 예요. 알려 주세요. 첫 로그인 때 새
          비밀번호로 바꾸게 돼요. (지금만 보여요)
          <Button className="mt-2" variant="secondary" onClick={() => setTempPw(null)}>
            확인했어요
          </Button>
        </p>
      )}
      {resettingPw && (
        <ConfirmDialog
          title="교사 비밀번호 초기화"
          message={`${resettingPw.name} 선생님의 비밀번호를 초기화할까요? 쓰던 비밀번호로는 로그인할 수 없게 되고, 새 임시 비밀번호가 한 번만 표시돼요.`}
          confirmLabel="초기화"
          loading={resetPw.isPending}
          onConfirm={() => resetPw.mutate(resettingPw.id)}
          onCancel={() => setResettingPw(null)}
        />
      )}
      {created && (
        <p className="mb-3 rounded-md bg-accent-50 p-3 text-base">
          {created.loginId} 의 초기 비밀번호: <code className="font-extrabold">{created.pw}</code>{' '}
          (지금만 보여요)
        </p>
      )}
      <div className="mb-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-base">
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
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="secondary"
                      loading={resetPw.isPending && resetPw.variables === t.id}
                      onClick={() => setResettingPw(t)}
                    >
                      비번 초기화
                    </Button>
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  // 반 삭제 (시범 명단 정리용). 학생이 남아 있거나 활동 기록이 있으면 서버가 409 로 막는다
  const [removing, setRemoving] = useState<ClassView | null>(null);
  const remove = useMutation({
    mutationFn: (classId: number) => adminApi.deleteClass(classId),
    onSuccess: () => {
      const name = removing?.name ?? '';
      setRemoving(null);
      onDone(`${name} 반을 지웠어요.`);
    },
    onError: (e) => {
      setRemoving(null);
      onError(e);
    },
  });

  return (
    <Card title="반">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-base">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-1 pr-2">반</th>
              <th className="py-1 pr-2">학생</th>
              <th className="py-1 pr-2">담임</th>
              <th className="py-1 pr-2">배정 교사(여러 명 가능)</th>
              <th className="py-1">삭제</th>
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
                <td className="py-2 pr-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.teacherIds.length === 0 && (
                      <span className="text-base text-ink-muted">없음</span>
                    )}
                    {c.teacherIds.map((id) => {
                      const t = teachers.find((x) => x.id === id);
                      if (!t) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-accent-100 pl-3 text-base"
                        >
                          {t.name}
                          <button
                            type="button"
                            aria-label={`${c.name}에서 ${t.name} 배정 해제`}
                            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-xl text-ink-muted hover:bg-accent-200"
                            onClick={() =>
                              assign.mutate({
                                classId: c.id,
                                teacherIds: c.teacherIds.filter((x) => x !== id),
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    <select
                      aria-label={`${c.name} 배정 교사 추가`}
                      className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                      value=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (id) assign.mutate({ classId: c.id, teacherIds: [...c.teacherIds, id] });
                      }}
                    >
                      <option value="">+ 교사 추가…</option>
                      {teachers
                        .filter((t) => !c.teacherIds.includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </td>
                <td className="py-2">
                  <Button
                    variant="danger"
                    aria-label={`${c.name} 반 지우기`}
                    disabled={c.studentCount > 0 || remove.isPending}
                    onClick={() => setRemoving(c)}
                  >
                    지우기
                  </Button>
                  {c.studentCount > 0 && (
                    <p className="mt-1 text-base text-ink-muted">학생이 있어요</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {removing && (
        <ConfirmDialog
          title={`${removing.name} 반 지우기`}
          message={`${removing.name} 반을 지울까요? 되돌릴 수 없어요. 글·순위·결산 같은 활동 기록이 있는 반은 지울 수 없어요.`}
          confirmLabel="지우기"
          danger
          requireText={removing.name}
          loading={remove.isPending}
          onConfirm={() => remove.mutate(removing.id)}
          onCancel={() => setRemoving(null)}
        />
      )}
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
