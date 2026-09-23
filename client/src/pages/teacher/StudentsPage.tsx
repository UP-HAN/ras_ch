import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeacherUser } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { teacherApi } from '@/api/teacher';
import { PageHeader } from '@/components/layout/PageHeader';
import { BonusModal } from '@/components/teacher/BonusModal';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useMe } from '@/hooks/useMe';
import { StudentEditModal } from './admin/StudentEditModal';

/** 학생 관리 (TCH-03 일부, AUTH-04): 반 선택 → 학생 표 → 비밀번호 초기화, 관리자는 동의·기자단·상태 수정 */
export function StudentsPage() {
  const { me } = useMe();
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const selected = classId ?? classes.data?.[0]?.id ?? null;
  const students = useQuery({
    queryKey: ['teacher', 'students', selected],
    queryFn: () => teacherApi.students(selected as number),
    enabled: selected !== null,
  });
  const [temp, setTemp] = useState<{ student: TeacherUser; password: string } | null>(null);
  const [editing, setEditing] = useState<TeacherUser | null>(null);
  const [bonusFor, setBonusFor] = useState<TeacherUser | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: (s: TeacherUser) =>
      teacherApi.resetPassword(s.id).then((r) => ({ student: s, password: r.tempPassword })),
    onSuccess: (r) => {
      setTemp(r);
      void qc.invalidateQueries({ queryKey: ['teacher', 'students', selected] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const onReset = (s: TeacherUser) => {
    if (
      window.confirm(`${s.name} 학생의 비밀번호를 초기화할까요? 임시 비밀번호가 새로 만들어져요.`)
    )
      reset.mutate(s);
  };

  return (
    <>
      <PageHeader
        title="학생 관리"
        description="반을 고르면 학생 목록이 나와요. 비밀번호를 잊은 학생은 초기화해 주세요."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            onClick={() => setClassId(c.id)}
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
          description="관리자 메뉴의 학생 CSV 등록으로 계정을 만들어요."
        />
      )}
      {students.data && students.data.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-line text-ink-muted">
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
                      {s.isReporter && <Badge tone="info">기자단</Badge>}
                      {s.mustChangePw && <Badge tone="neutral">초기 비번</Badge>}
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
                      <div className="flex gap-1">
                        <Button variant="primary" onClick={() => setBonusFor(s)}>
                          칭찬
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => onReset(s)}
                          loading={reset.isPending && reset.variables?.id === s.id}
                        >
                          비밀번호 초기화
                        </Button>
                        {me?.role === 'admin' && (
                          <Button variant="ghost" onClick={() => setEditing(s)}>
                            수정
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
    </>
  );
}
