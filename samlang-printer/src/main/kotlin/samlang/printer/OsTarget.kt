package samlang.printer

/** The OS target. */
internal enum class OsTarget {
    WINDOWS, MAC_OS, LINUX;

    companion object {
        @JvmField
        val DEFAULT: OsTarget = getOsFromString(osNameString = System.getProperty("os.name"))

        /**
         * @param osNameString the os name string from the user.
         * @return the os target object.
         */
        @JvmStatic
        private fun getOsFromString(osNameString: String): OsTarget {
            val osName = osNameString.toLowerCase()
            return when {
                "windows" in osName -> WINDOWS
                "mac" in osName -> MAC_OS
                else -> LINUX
            }
        }
    }
}
