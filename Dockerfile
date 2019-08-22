FROM gradle:5.6-jdk11 as builder

COPY build.gradle.kts .
COPY settings.gradle .
COPY samlang-ast ./samlang-ast
COPY samlang-checker ./samlang-checker
COPY samlang-compiler ./samlang-compiler
COPY samlang-errors ./samlang-errors
COPY samlang-interpreter ./samlang-interpreter
COPY samlang-parser ./samlang-parser
COPY samlang-printer ./samlang-printer
COPY samlang-utils ./samlang-utils
COPY src ./src

RUN gradle build

FROM openjdk:11-jre

# Copy the jar to the production image from the builder stage.
COPY --from=builder /home/gradle/build/libs/samlang-0.0.8-all.jar /samlang.jar

# Run the server subcommand on container startup.
CMD [ "java", "-jar", "/samlang.jar", "server" ]
