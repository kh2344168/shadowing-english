$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:5017/api'
$Password = if ($env:SHADOWING_DEMO_PASSWORD) { $env:SHADOWING_DEMO_PASSWORD } else { '123456' }
$StudentEmail = if ($env:SHADOWING_STUDENT_EMAIL) { $env:SHADOWING_STUDENT_EMAIL } else { 'khaled.demo@example.com' }
$StudentPassword = if ($env:SHADOWING_STUDENT_PASSWORD) { $env:SHADOWING_STUDENT_PASSWORD } else { '123456' }
$ExpectedGroupId = if ($env:SHADOWING_EXPECTED_GROUP_ID) { $env:SHADOWING_EXPECTED_GROUP_ID } else { '' }

function Login($uri, $email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $body
}

Write-Host '[CHECK][PUBLISH] Admin login...' -ForegroundColor Cyan
$admin = Login "$Base/auth/demo-login" 'admin@demo.com' $Password
$headers = @{ 'X-Shadowing-Session' = $admin.sessionToken }

$curriculums = @(Invoke-RestMethod -Method Get -Uri "$Base/admin/curriculums" -Headers $headers)
$groups = @(Invoke-RestMethod -Method Get -Uri "$Base/admin/learning-groups" -Headers $headers)
$students = @(Invoke-RestMethod -Method Get -Uri "$Base/admin/students" -Headers $headers)
$lessons = @(Invoke-RestMethod -Method Get -Uri "$Base/lessons" -Headers $headers)
$failed = 0
Write-Host "[CHECK][DIRECTORY] curriculums=$($curriculums.Count) groups=$($groups.Count) students=$($students.Count) lessons=$($lessons.Count)"

$badGroupCurriculums = @($groups | Where-Object { $_.curriculumId -and -not ($curriculums.id -contains $_.curriculumId) })
if ($badGroupCurriculums.Count -gt 0) {
  $failed++
  Write-Host "[CHECK][GROUP_CURRICULUM][FAILED] $($badGroupCurriculums.Count) group(s) reference a curriculum missing from SQL." -ForegroundColor Red
  $badGroupCurriculums | ForEach-Object { Write-Host " - $($_.name) -> $($_.curriculumId)" }
} else {
  Write-Host '[CHECK][GROUP_CURRICULUM][SUCCESS] Every linked group curriculum exists in SQL.' -ForegroundColor Green
}

$badStudents = @($students | Where-Object { -not ($groups.id -contains $_.groupId) })
if ($badStudents.Count -gt 0) {
  $failed++
  Write-Host "[CHECK][STUDENT_GROUP][FAILED] $($badStudents.Count) student(s) reference missing backend groups." -ForegroundColor Red
  $badStudents | ForEach-Object { Write-Host " - $($_.email) -> $($_.groupId)" }
} else {
  Write-Host '[CHECK][STUDENT_GROUP][SUCCESS] Every student belongs to an existing SQL group.' -ForegroundColor Green
}

foreach ($group in $groups) {
  try {
    $verify = Invoke-RestMethod -Method Get -Uri "$Base/group-curriculums/$([uri]::EscapeDataString($group.id))/verify" -Headers $headers
    if (-not $verify.isValid) {
      $failed++
      Write-Host "[CHECK][PUBLISH_VERIFY][FAILED] $($group.name) version=$($verify.version) slots=$($verify.slotCount) missing=$($verify.missingLessonIds.Count) statusWarnings=$($verify.unavailableLessonIds.Count)" -ForegroundColor Red
    } else {
      Write-Host "[CHECK][PUBLISH_VERIFY][SUCCESS] $($group.name) version=$($verify.version) slots=$($verify.slotCount) lessons=$($verify.distinctLessonCount)" -ForegroundColor Green
      if ($verify.unavailableLessonIds.Count -gt 0) {
        Write-Host "[CHECK][PUBLISH_VERIFY][STATUS_WARNING] $($group.name) has $($verify.unavailableLessonIds.Count) published lesson(s) carrying draft/archived library metadata." -ForegroundColor Yellow
      }
    }
  } catch {
    $status = try { $_.Exception.Response.StatusCode.value__ } catch { 0 }
    if ($status -eq 404) {
      Write-Host "[CHECK][PUBLISH_VERIFY][NOT_PUBLISHED] $($group.name)" -ForegroundColor Yellow
    } else {
      $failed++
      Write-Host "[CHECK][PUBLISH_VERIFY][ERROR] $($group.name): $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host "[CHECK][STUDENT_VISIBILITY] Login $StudentEmail ..." -ForegroundColor Cyan
try {
  $student = Login "$Base/auth/student-login" $StudentEmail $StudentPassword
  $studentHeaders = @{ 'X-Shadowing-Session' = $student.sessionToken }
  $session = Invoke-RestMethod -Method Get -Uri "$Base/auth/session" -Headers $studentHeaders
  Write-Host "[CHECK][STUDENT_SESSION] email=$StudentEmail group=$($session.groupId) groupName=$($session.groupName) level=$($session.cefrLevel)" -ForegroundColor Cyan
  if ($ExpectedGroupId -and $session.groupId -ne $ExpectedGroupId) {
    $failed++
    Write-Host "[CHECK][STUDENT_GROUP_TARGET][FAILED] expected=$ExpectedGroupId actual=$($session.groupId)" -ForegroundColor Red
  } elseif ($ExpectedGroupId) {
    Write-Host "[CHECK][STUDENT_GROUP_TARGET][SUCCESS] group=$ExpectedGroupId" -ForegroundColor Green
  }
  $studentLessons = @(Invoke-RestMethod -Method Get -Uri "$Base/lessons" -Headers $studentHeaders)
  $published = Invoke-RestMethod -Method Get -Uri "$Base/group-curriculums/$([uri]::EscapeDataString($session.groupId))/published" -Headers $studentHeaders
  $publishedIds = @()
  foreach ($week in @($published.weeks)) {
    foreach ($day in @($week.days)) {
      foreach ($slot in @($day.lessonSlots)) { $publishedIds += $slot.lessonId }
    }
  }
  $studentIds = @($studentLessons | ForEach-Object { $_.id })
  $missingForStudent = @($publishedIds | Select-Object -Unique | Where-Object { $studentIds -notcontains $_ })
  if ($missingForStudent.Count -gt 0) {
    $failed++
    Write-Host "[CHECK][STUDENT_VISIBILITY][FAILED] group=$($session.groupId) publishedLessonIds=$(@($publishedIds | Select-Object -Unique).Count) visibleLessons=$($studentIds.Count) missing=$($missingForStudent.Count)" -ForegroundColor Red
    $missingForStudent | ForEach-Object { Write-Host " - missing lesson: $_" }
  } else {
    Write-Host "[CHECK][STUDENT_VISIBILITY][SUCCESS] group=$($session.groupId) version=$($published.version) visibleLessons=$($studentIds.Count)" -ForegroundColor Green
  }
} catch {
  $failed++
  Write-Host "[CHECK][STUDENT_VISIBILITY][ERROR] $($_.Exception.Message)" -ForegroundColor Red
}

if ($failed -gt 0) {
  Write-Host "[CHECK][PUBLISH][FAILED] failures=$failed" -ForegroundColor Red
  exit 31
}
Write-Host '[CHECK][PUBLISH][SUCCESS] Backend groups, membership, publication, and student visibility are consistent.' -ForegroundColor Green
