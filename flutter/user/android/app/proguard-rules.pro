# Plivo endpoint AAR bundles slf4j-api internally but ships no slf4j binding.
# slf4j 1.x gracefully falls back to a NOP logger when no binding is present,
# so the missing org.slf4j.impl.StaticLoggerBinder is benign at runtime.
-dontwarn org.slf4j.**
