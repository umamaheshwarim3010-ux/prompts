# Modern Windows Explorer-style folder picker using COM IFileDialog
# This gives the full Explorer window with sidebar, breadcrumb nav, etc.

$source = @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogCOM { }

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFileDialog {
    [PreserveSig] int Show([In] IntPtr parent);
    void SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
    void SetFileTypeIndex([In] uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise([In] IntPtr pfde, out uint pdwCookie);
    void Unadvise([In] uint dwCookie);
    void SetOptions([In] uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder([In] IShellItem psi);
    void SetFolder([In] IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace([In] IShellItem psi, int fdap);
    void SetDefaultExtension([In, MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid([In] ref Guid guid);
    void ClearClientData();
    void SetFilter([MarshalAs(UnmanagedType.Interface)] IntPtr pFilter);
}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellItem {
    void BindToHandler([In] IntPtr pbc, [In, MarshalAs(UnmanagedType.LPStruct)] Guid bhid, [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName([In] uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
    void Compare([In] IShellItem psi, [In] uint hint, out int piOrder);
}

public class ModernFolderPicker {
    public static string ShowDialog() {
        try {
            IFileDialog dialog = (IFileDialog)new FileOpenDialogCOM();
            // Get existing options and add FOS_PICKFOLDERS (0x20) + FOS_FORCEFILESYSTEM (0x40)
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(options | 0x20u | 0x40u);
            dialog.SetTitle("Browse For Folder");
            dialog.SetOkButtonLabel("Select Folder");
            int hr = dialog.Show(IntPtr.Zero);
            if (hr < 0) return "::CANCELLED::";
            IShellItem item;
            dialog.GetResult(out item);
            string path;
            item.GetDisplayName(0x80058000u, out path);
            return path;
        } catch (Exception ex) {
            return "::ERROR::" + ex.Message;
        }
    }
}
'@

try { Add-Type -TypeDefinition $source } catch { }
$result = [ModernFolderPicker]::ShowDialog()
Write-Output $result
