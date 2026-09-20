$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:5017/api'
$Password = if ($env:SHADOWING_DEMO_PASSWORD) { $env:SHADOWING_DEMO_PASSWORD } else { '123456' }

function Login-Demo($email) {
  $body = @{ email = $email; password = $Password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$Base/auth/demo-login" -ContentType 'application/json' -Body $body
}
function Login-Student($email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$Base/auth/student-login" -ContentType 'application/json' -Body $body
}
function Session($token) {
  Invoke-RestMethod -Method Get -Uri "$Base/auth/session" -Headers @{ 'X-Shadowing-Session' = $token }
}

Write-Host '[CHECK][TAB_SESSION] Logging in teacher and student as two independent tabs...'
$teacher = Login-Demo 'teacher@demo.com'
$student = Login-Student 'khaled.demo@example.com' '123456'
$teacher1 = Session $teacher.sessionToken
$student1 = Session $student.sessionToken
$teacher2 = Session $teacher.sessionToken

if ($teacher1.role -ne 'teacher' -or $student1.role -ne 'student' -or $teacher2.role -ne 'teacher') {
  Write-Host '[CHECK][TAB_SESSION][FAILED]' -ForegroundColor Red
  Write-Host "teacher1=$($teacher1.role) student=$($student1.role) teacher2=$($teacher2.role)"
  exit 21
}
Write-Host '[CHECK][TAB_SESSION][SUCCESS] teacher -> student -> teacher stayed isolated.' -ForegroundColor Green
Write-Host "Teacher=$($teacher1.email) | Student=$($student1.email) | StudentGroup=$($student1.groupId)"
