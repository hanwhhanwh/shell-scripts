@echo off

REM set 7-zip file full-path
SET ARCHIVE="C:\Program Files\7-Zip\7z.exe"
REM set 7-zip parameters
SET PARAMETERS=a -r -t7z -mx=1

REM make zip file backup folder
MKDIR ZIP_FILES

REM list all zip files
FOR %%f IN (*.zip) DO (
	REM extract zip file
	%ARCHIVE% x "%%f" -o"%%~nf"
	CD "%%~nf"
	REM archive 7-zip file
	%ARCHIVE% %PARAMETERS% "..\%%~nf" *
	CD ..
	REM remove extracted folder
	RMDIR /Q /S "%%~nf"
	REM backup zip file
	MOVE "%%f" ZIP_FILES
)

PAUSE