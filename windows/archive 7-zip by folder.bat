@echo off

REM set 7-zip file full-path
SET ARCHIVE="C:\Program Files\7-Zip\7z.exe"
REM set 7-zip parameters
SET PARAMETERS=a -r -t7z -mx=1

REM list all folders
FOR /D %%s in (*) DO (
    @echo Archiving %%s...
    CD "%%s"
    REM archive 7-zip file
    %ARCHIVE% %PARAMETERS% "..\%%s.7z" *
    CD ..
)

PAUSE