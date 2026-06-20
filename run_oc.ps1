param(
    [string]$instruction,
    [string]$sessionId = ""
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class UProc {
    [DllImport("wtsapi32.dll", SetLastError=true)] public static extern bool WTSQueryUserToken(uint s, out IntPtr t);
    [DllImport("advapi32.dll", SetLastError=true)] public static extern bool DuplicateTokenEx(IntPtr h, uint a, IntPtr z, uint il, uint tt, out IntPtr n);
    [DllImport("userenv.dll", SetLastError=true)] public static extern bool CreateEnvironmentBlock(out IntPtr e, IntPtr t, bool i);
    [DllImport("userenv.dll", SetLastError=true)] public static extern bool DestroyEnvironmentBlock(IntPtr e);
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CreateProcessAsUser(IntPtr t, string a, string c, IntPtr pa, IntPtr ta, bool ih, uint f, IntPtr e, string d, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetExitCodeProcess(IntPtr h, out uint ec);
    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFO {
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public uint dwX; public uint dwY; public uint dwXSize; public uint dwYSize;
        public uint dwXCountChars; public uint dwYFillAttribute; public uint dwFlags;
        public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2;
        public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public uint dwProcessId; public uint dwThreadId; }
    public static uint Run(uint sess, string cmd, string dir) {
        IntPtr t,dt,e;
        if(!WTSQueryUserToken(sess,out t)) return 0xFFFFFFFF;
        if(!DuplicateTokenEx(t,0x2000000,IntPtr.Zero,2,1,out dt)){ uint e2=(uint)Marshal.GetLastWin32Error(); CloseHandle(t); return e2; }
        CloseHandle(t);
        if(!CreateEnvironmentBlock(out e,dt,false)){ uint e2=(uint)Marshal.GetLastWin32Error(); CloseHandle(dt); return e2; }
        STARTUPINFO si=new STARTUPINFO(); si.cb=Marshal.SizeOf(typeof(STARTUPINFO)); si.dwFlags=0x00000001; si.wShowWindow=0;
        PROCESS_INFORMATION pi;
        if(!CreateProcessAsUser(dt,null,cmd,IntPtr.Zero,IntPtr.Zero,false,0x00008400,e,dir,ref si,out pi)){
            DestroyEnvironmentBlock(e); CloseHandle(dt); return (uint)Marshal.GetLastWin32Error();
        }
        DestroyEnvironmentBlock(e); CloseHandle(dt);
        WaitForSingleObject(pi.hProcess,0xFFFFFFFF); // wait forever
        uint ec; GetExitCodeProcess(pi.hProcess,out ec);
        CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
        return ec;
    }
}
"@

# Detect active user session (skip services session 0)
$sessions = @(tasklist //v //fi "IMAGENAME eq explorer.exe" 2>$null | Select-String -Pattern "Console\s+(\d+)" | ForEach-Object { $_.Matches.Groups[1].Value })
$winSession = if ($sessions.Count -gt 0) { [int]$sessions[0] } else { 1 }

$dir = Split-Path -Parent $PSCommandPath
if ($sessionId) {
    $cmd = "cmd.exe /c opencode --dir ""$dir"" -s ""$sessionId"" --format json ""$instruction"""
} else {
    $cmd = "cmd.exe /c opencode run --dir ""$dir"" --format json ""$instruction"""
}
$ec = [UProc]::Run($winSession, $cmd, $dir)
Write-Host "exit:$ec"
