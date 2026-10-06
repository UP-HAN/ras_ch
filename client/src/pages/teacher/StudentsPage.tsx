import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeacherUser } from '@server-types/api';
import { useState } from 'react';
import { adminApi } from '@/api/admin';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { PageHeader } from '@/components/layout/PageHeader';
import { AddStudentModal } from '@/components/teacher/AddStudentModal';
import { BonusModal } from '@/components/teacher/BonusModal';
import { CouncilModal } from '@/components/teacher/CouncilModal';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Spinner } from '@/components/ui';
import { useClassParam } from '@/hooks/useClassParam';
import { useMe } from '@/hooks/useMe';
import { StudentEditModal } from './admin/StudentEditModal';

/**
 * 학생 관리 (TCH-03 일부, AUTH-04): 반 선택 → 학생 표 → 비밀번호 초기화, 관리자는 동의·기자단·상태 수정
 *  - 파괴적 동작(비밀번호 초기화·반 학생 모두 지우기)은 확인 모달을 거친다 (QA #1)
 */
export function StudentsPage() {
  const { me } = useMe();
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const { selected, select } = useClassParam(classes.data);
  const students = useQuery({
    queryKey: ['teacher', 'students', selected],
    queryFn: () => teacherApi.students(selected as number),
    enabled: selected !== null,
  });
  const [temp, setTemp] = useState<{ student: TeacherUser; password: string } | null>(null);
  const [editing, setEditing] = useState<TeacherUser | null>(null);
  const [bonusFor, setBonusFor] = useState<TeacherUser | null>(null);
  const [resetting, setResetting] = useState<TeacherUser | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [councilFor, setCouncilFor] = useState<TeacherUser | null>(null);
  const [removing, setRemoving] = useState<TeacherUser | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cls = classes.data?.find((c) => c.id === selected);
  const refreshStudents = () => {
    void qc.invalidateQueries({ queryKey: ['teacher'] });
  };
  /** 비어 있는 다음 번호 (학생 추가 기본값) */
  const nextNo = (students.data ?? []).reduce((m, s) => Math.max(m, s.studentNo ?? 0), 0) + 1;

  // 담임·배정 교사도 자기 반 학생을 고칠 수 있다 (2026-10-06 사용자 요청)
  const toggleReporter = useMutation({
    mutationFn: (s: TeacherUser) => teacherApi.editStudent(s.id, { isReporter: !s.isReporter }),
    onSuccess: (_r, s) => {
      setMsg(`${s.name} 학생을 기자단에서 ${s.isReporter ? '뺐어요' : '넣었어요'}.`);
      setError(null);
      refreshStudents();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const clearCouncil = useMutation({
    mutationFn: (s: TeacherUser) => teacherApi.clearCouncil(s.id),
    onSuccess: (_r, s) => {
      setMsg(`${s.name} 학생의 자치회 임원을 해제했어요.`);
      setError(null);
      refreshStudents();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const removeOne = useMutation({
    mutationFn: (s: TeacherUser) => teacherApi.deleteStudent(s.id),
    onSuccess: (_r, s) => {
      setRemoving(null);
      setMsg(`${s.name} 학생을 지웠어요.`);
      setError(null);
      refreshStudents();
    },
    onError: (e) => {
      setRemoving(null);
      setError(errorMessage(e));
    },
  });

  const reset = useMutation({
    mutationFn: (s: TeacherUser) =>
      teacherApi.resetPassword(s.id).then((r) => ({ student: s, password: r.tempPassword })),
    onSuccess: (r) => {
      setTemp(r);
      setResetting(null);
      void qc.invalidateQueries({ queryKey: ['teacher', 'students', selected] });
    },
    onError: (e) => {
      setResetting(null);
      setError(errorMessage(e));
    },
  });

  const removeAll = useMutation({
    mutationFn: () => adminApi.deleteClassStudents(selected as number),
    onSuccess: (r) => {
      setRemovingAll(false);
      setMsg(
        `${r.deleted}명을 지웠어요.${r.skipped.length ? ` 활동 기록이 있는 ${r.skipped.map((s) => s.name).join(', ')} 학생은 남겼어요(상태를 "중지"로 바꿔 주세요).` : ''}`,
      );
      void qc.invalidateQueries({ queryKey: ['teacher'] });
    },
    onError: (e) => {
      setRemovingAll(false);
      setError(errorMessage(e));
    },
  });

  /**
   * 학생 한 명의 동작 버튼 (카드·표에서 같이 쓴다).
   * 기자단·임원은 눌러서 켜고 끄는 토글이라 지금 상태가 색으로 보인다.
   */
  const RowActions = ({ s }: { s: TeacherUser }) => (
    <div className="flex flex-wrap gap-1">
      <Button variant="primary" onClick={() => setBonusFor(s)}>
        칭찬
      </Button>
      <Button
        variant="secondary"
        onClick={() => setResetting(s)}
        loading={reset.isPending && reset.variables?.id === s.id}
      >
        비번 초기화
      </Button>
      <Button
        variant={s.isReporter ? 'primary' : 'ghost'}
        aria-pressed={s.isReporter}
        title={s.isReporter ? '눌러서 기자단에서 빼기' : '눌러서 기자단으로 넣기'}
        loading={toggleReporter.isPending && toggleReporter.variables?.id === s.id}
        onClick={() => toggleReporter.mutate(s)}
      >
        기자단
      </Button>
      <Button
        variant={s.isCouncil ? 'primary' : 'ghost'}
        aria-pressed={s.isCouncil}
        title={s.isCouncil ? '눌러서 임원 해제' : '눌러서 자치회 임원으로 지정'}
        loading={clearCouncil.isPending && clearCouncil.variables?.id === s.id}
        onClick={() => (s.isCouncil ? clearCouncil.mutate(s) : setCouncilFor(s))}
      >
        임원
      </Button>
      {me?.role === 'admin' && (
        <Button variant="ghost" onClick={() => setEditing(s)}>
          수정
        </Button>
      )}
      <Button variant="danger" onClick={() => setRemoving(s)}>
        지우기
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="학생 관리"
        description="반을 고르면 학생 목록이 나와요. 전학 온 학생은 추가하고, 기자단·자치회 임원도 여기서 정해요."
        action={cls ? <Button onClick={() => setAdding(true)}>+ 학생 추가</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="반 선택">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            aria-pressed={c.id === selected}
            onClick={() => select(c.id)}
          >
            {c.name} ({c.studentCount}명)
          </Button>
        ))}
        {classes.data?.length === 0 && (
          <p className="text-base text-ink-muted">
            담당 반이 없어요. 관리자에게 반 배정을 요청하세요.
          </p>
        )}
      </div>

      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-base font-medium text-danger-600">
          {error}
        </p>
      )}

      {temp && (
        <Card tone="accent" className="mb-4" title="임시 비밀번호">
          <p className="text-base">
            <strong>{temp.student.name}</strong> 학생의 임시 비밀번호는{' '}
            <code className="rounded bg-surface px-2 py-1 text-xl font-extrabold">
              {temp.password}
            </code>{' '}
            예요. 학생에게 알려 주세요. 첫 로그인 때 새 비밀번호로 바꾸게 돼요. 이 화면을 닫으면
            다시 볼 수 없어요.
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => setTemp(null)}>
            확인했어요
          </Button>
        </Card>
      )}

      {students.isLoading && <Spinner className="text-accent-600" />}
      {students.data && students.data.length === 0 && (
        <EmptyState
          icon="🧑‍🎓"
          title="아직 학생이 없어요"
          description="위의 “+ 학생 추가”로 한 명씩 넣거나, 관리자 메뉴의 학생 CSV 등록으로 한꺼번에 만들어요."
          action={cls ? <Button onClick={() => setAdding(true)}>+ 학생 추가</Button> : undefined}
        />
      )}
      {students.data && students.data.length > 0 && (
        <>
          <Card>
            <ul className="divide-y divide-line md:hidden" data-testid="students-cards">
              {students.data.map((s) => (
                <li key={s.id} className="space-y-2 py-3 text-base">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">
                      {s.studentNo}번 {s.name}
                    </span>
                    <span className="text-ink-muted">{s.displayName}</span>
                    <span className="text-ink-muted">{s.loginId}</span>
                    <Badge tone={s.parentConsent === 'Y' ? 'success' : 'warn'}>
                      {s.parentConsent === 'Y' ? '동의' : '미동의'}
                    </Badge>
                    {s.isReporter && <Badge tone="info">기자단</Badge>}
                    {s.isCouncil && <Badge tone="primary">자치회 임원</Badge>}
                    {s.mustChangePw && <Badge tone="neutral">초기 비번</Badge>}
                    {s.status !== 'active' && (
                      <Badge tone="neutral">
                        {s.status === 'transferred'
                          ? '전출'
                          : s.status === 'graduated'
                            ? '졸업'
                            : '중지'}
                      </Badge>
                    )}
                  </div>
                  <RowActions s={s} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left text-base">
                <thead>
                  <tr className="border-b border-line whitespace-nowrap text-ink-muted">
                    <th className="py-2 pr-3">번호</th>
                    <th className="py-2 pr-3">이름</th>
                    <th className="py-2 pr-3">표시 이름</th>
                    <th className="py-2 pr-3">아이디</th>
                    <th className="py-2 pr-3">동의</th>
                    <th className="py-2 pr-3">표시</th>
                    <th className="py-2 pr-3">상태</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {students.data.map((s) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="py-2 pr-3">{s.studentNo}</td>
                      <td className="py-2 pr-3 font-semibold">{s.name}</td>
                      <td className="py-2 pr-3">{s.displayName}</td>
                      <td className="py-2 pr-3 text-ink-muted">{s.loginId}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={s.parentConsent === 'Y' ? 'success' : 'warn'}>
                          {s.parentConsent === 'Y' ? '동의' : '미동의'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {s.isReporter && <Badge tone="info">기자단</Badge>}
                          {s.isCouncil && <Badge tone="primary">자치회 임원</Badge>}
                          {s.mustChangePw && <Badge tone="neutral">초기 비번</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {s.status === 'active'
                          ? '재학'
                          : s.status === 'transferred'
                            ? '전출'
                            : s.status === 'graduated'
                              ? '졸업'
                              : '중지'}
                      </td>
                      <td className="py-2">
                        <RowActions s={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {me?.role === 'admin' && (
            <Card
              className="mt-6 border-danger-600/40"
              title="위험한 작업"
              data-testid="danger-zone"
            >
              <p className="mb-2 text-base text-ink-muted">
                시범 명단을 정리하고 실제 명단을 CSV 로 다시 올릴 때만 써요. 글·댓글·포인트가 있는
                학생은 지워지지 않고 남아요.
              </p>
              <Button variant="danger" onClick={() => setRemovingAll(true)}>
                이 반 학생 모두 지우기
              </Button>
            </Card>
          )}
        </>
      )}

      {resetting && (
        <ConfirmDialog
          title="비밀번호 초기화"
          message={`${resetting.name} 학생의 비밀번호를 초기화할까요? 학생은 기존 비밀번호로 로그인할 수 없게 되고, 새 임시 비밀번호가 한 번만 표시돼요.`}
          confirmLabel="초기화"
          loading={reset.isPending}
          onConfirm={() => reset.mutate(resetting)}
          onCancel={() => setResetting(null)}
        />
      )}
      {removingAll && cls && (
        <ConfirmDialog
          title={`${cls.name} 학생 모두 지우기`}
          message={`${cls.name} 학생 ${cls.studentCount}명을 모두 지울까요? 되돌릴 수 없어요. 지운 뒤 "학생 CSV 등록"으로 실제 명단을 올리면 돼요.`}
          confirmLabel="모두 지우기"
          danger
          requireText={cls.name}
          loading={removeAll.isPending}
          onConfirm={() => removeAll.mutate()}
          onCancel={() => setRemovingAll(false)}
        />
      )}
      {bonusFor && (
        <BonusModal
          student={bonusFor}
          onClose={() => setBonusFor(null)}
          onGranted={(r) => {
            setMsg(
              `${bonusFor.name} 학생에게 ${r.granted}P를 줬어요. (이 학생 이번 주 ${r.remainingStudentWeek}P, 선생님 전체 ${r.remainingTeacherWeek}P 남음)`,
            );
            setBonusFor(null);
          }}
        />
      )}
      {editing && (
        <StudentEditModal
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['teacher', 'students', selected] });
          }}
        />
      )}
      {adding && cls && (
        <AddStudentModal
          klass={cls}
          nextNo={nextNo}
          onClose={() => setAdding(false)}
          onAdded={(r) => {
            setAdding(false);
            const row = r.rows[0];
            setMsg(
              row
                ? `${cls.name} ${row.studentNo}번 학생을 넣었어요. 아이디 ${row.loginId}${
                    row.initialPassword
                      ? `, 초기 비밀번호 ${row.initialPassword} (지금만 보여요)`
                      : ''
                  }`
                : '학생을 넣었어요.',
            );
            setError(null);
            refreshStudents();
          }}
        />
      )}
      {councilFor && (
        <CouncilModal
          student={councilFor}
          onClose={() => setCouncilFor(null)}
          onSaved={(m) => {
            setCouncilFor(null);
            setMsg(m);
            setError(null);
            refreshStudents();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`${removing.name} 학생 지우기`}
          message={`${removing.name}(${removing.studentNo}번) 학생을 지울까요? 되돌릴 수 없어요. 글·댓글·포인트가 있는 학생은 지워지지 않아요.`}
          confirmLabel="지우기"
          danger
          requireText={removing.name}
          loading={removeOne.isPending}
          onConfirm={() => removeOne.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
