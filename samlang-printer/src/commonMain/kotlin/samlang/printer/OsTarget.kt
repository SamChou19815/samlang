package samlang.printer

/** The OS target. */
enum class OsTarget {
    WINDOWS, MAC_OS, LINUX;

    companion object {
        /**
         * @param osNameString the os name string from the user.
         * @return the os target object.
         */
        fun getOsFromString(osNameString: String): OsTarget {
            val osName = osNameString.toLowerCase()
            return when {
                "windows" in osName -> WINDOWS
                "mac" in osName -> MAC_OS
                else -> LINUX
            }
        }
    }
}
