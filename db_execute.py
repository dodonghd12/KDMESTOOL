from tkinter import messagebox
import json

############################################################################################################################################################

from db_connections import connect_pg_db, connect_old_pg_db

############################################################################################################################################################

#Postgre Select Query
def execute_pg_select_query(query, params=()):
    conn = connect_pg_db()
    if conn is None:
        return [], []
    
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = cursor.fetchall()
        column_names = [desc[0] for desc in cursor.description]
        cursor.close()
        return result, column_names
    finally:
        conn.close()

def execute_old_pg_select_query(query, params=()):
    conn = connect_old_pg_db()
    if conn is None:
        return [], []
    
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = cursor.fetchall()
        column_names = [desc[0] for desc in cursor.description]
        return result, column_names
    finally:
        conn.close()

#Postgre Update Query
def execute_pg_update_query(query, params):
    conn = connect_pg_db()
    if conn is None:
        return
    
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
    finally:
        conn.close()


#Postgre Insert Query
def convert_value(val):
    if isinstance(val, dict):
        return json.dumps(val, ensure_ascii=False)
    
    if isinstance(val, (list, tuple)):
        if all(isinstance(v, (dict, list)) for v in val):
            return json.dumps(val, ensure_ascii=False)
        else:
            return "{" + ",".join(str(v) for v in val) + "}"
    
    if isinstance(val, str):
        stripped = val.strip()
        if stripped == "[]":
            return "[]"
        if (stripped.startswith("{") and stripped.endswith("}")) or \
           (stripped.startswith("[") and stripped.endswith("]")):
            return stripped
        return val
    
    return val

def execute_pg_insert_query(table_name, result, column_names):
    conn = connect_pg_db()
    if conn is None:
        return

    try:
        with conn.cursor() as cur:
            cols_str = ", ".join(column_names)
            placeholders = ", ".join(["%s"] * len(column_names))
            insert_sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

            for row in result:
                row_processed = [convert_value(v) for v in row]
                cur.execute(insert_sql, row_processed)

        conn.commit()
    except Exception as e:
        print(f"Error inserting into {table_name}: {e}")
    finally:
        conn.close()