import pg8000
import pyodbc

#Postgre
def connect_pg_db():
    try:
        conn = pg8000.connect(
            user = "postgres",
            password = "kenda",
            database = "kverp",
            host = "198.1.10.85",
            port = 5432
        )

        return conn
    except Exception as e:
        print(f"Error connecting to the database: {e}")
        return None
    
def connect_old_pg_db():
    try:
        conn = pg8000.connect(
            user = "postgres",
            password = "kenda",
            database = "kverp",
            host = "198.1.1.92",
            port = 5432
        )

        return conn
    except Exception as e:
        print(f"Error connecting to the database: {e}")
        return None