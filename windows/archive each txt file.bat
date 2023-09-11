REM each text file archiving script
@echo off

REM set 7-zip file full-path
SET ARCHIVE="C:\Program Files\7-Zip\7z.exe"
REM set 7-zip parameters
SET PARAMETERS=a -r -t7z -mx=9

REM make text file backup folder
MKDIR TXT_FILES

REM list all text files
FOR %%f IN (*.txt) DO (
	REM archive 7-zip file
	%ARCHIVE% %PARAMETERS% "%%~nf.7z" "%%f"
	MOVE "%%f" TXT_FILES
)

PAUSE