package samlang.server

import com.google.gson.Gson
import spark.Spark.get
import spark.Spark.port
import spark.Spark.post

fun startServer() {
    val gson = Gson()
    port(System.getenv("PORT")?.toIntOrNull() ?: 8080)
    get("/") { _, _ -> "OK" }
    post("/api/respond", { req, _ -> WebDemoController.interpret(programString = req.body()) }, gson::toJson)
}
