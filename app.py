from typing import Any
from flask import Flask, render_template, request, jsonify, session, redirect, url_for # type: ignore
from flask_session import Session
import pytz # type: ignore
import urllib3 # type: ignore
import requests # type: ignore
import json
import os
import base64
from datetime import datetime, timezone, timedelta
import ast
import re
from typing import Optional

gitlab_private_token = os.environ.get('GITLAB_PRIVATE_TOKEN', '')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def serialize_row(row):
    serialized = []
    for value in row:
        if isinstance(value, dict):
            serialized.append(json.dumps(value, indent=2, ensure_ascii=False))
        elif isinstance(value, (list, tuple)) and value and isinstance(value[0], (dict, list)):
            serialized.append(json.dumps(value, indent=2, ensure_ascii=False))
        else:
            serialized.append(value)
    return serialized

def get_auth_headers(session):
    headers = {
        'accept': 'application/json',
        'x-mui-auth-key': session.get('user_token', '')
    }
    
    # Get Cookie string from session
    if 'user_cookie_string' in session:
        headers['Cookie'] = session['user_cookie_string']
    
    return headers

def get_client_ip():
    user_ip = request.headers.get("x-forwarded-for")
    if user_ip:
        return user_ip.split(",")[0].strip()
    
    return request.remote_addr

from db_execute import (
    execute_pg_select_query
)
from utils import (
    APP_VERSION, 
    convert_iso_datetime, 
    convert_timestamp, 
    get_config_data
)

app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')
Session(app)

# Default language
default_language = "vi"

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('main'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':

        #get user ip
        user_ip = get_client_ip()

        # Get data from JSON (sent from JavaScript)
        if request.is_json:
            data = request.get_json()
            user_id = data.get('user_id', '').strip() if data else ''
            password = data.get('password', '').strip() if data else ''
        else:
            # Fallback to form data
            user_id = request.form.get('user_id', '').strip()
            password = request.form.get('password', '').strip()
        
        if not user_id or not password:
            return jsonify({'success': False, 'message': 'Vui lòng nhập đầy đủ Tài khoản và mật khẩu.'})
        
        # Validate tool availability
        tool_status = get_config_data("available")
        if tool_status and tool_status[0] == "N":
            return jsonify({'success': False, 'message': 'Tool không khả dụng ở thời điểm hiện tại'})
        
        # Validate user
        url = "https://198.1.10.85:8810/api/user/login"
        headers = {
            "accept": "application/json",
            "Content-Type": "application/json"
        }
        data = {
            "ID": user_id,
            "loginType": 0,
            "password": password
        }
        
        try:
            response = requests.post(url, headers=headers, json=data, verify=False)
            response_data = response.json()
            if response_data.get('data'):
                session['user_id'] = user_id
                session['user_token'] = response_data['data']['token']
                session['user_ip'] = user_ip
                
                # Save cookies from response - build cookie string
                cookie_parts = []
                if response.cookies:
                    for cookie in response.cookies:
                        cookie_parts.append(f"{cookie.name}={cookie.value}")
                
                # Also check Set-Cookie headers
                if 'Set-Cookie' in response.headers:
                    set_cookie = response.headers['Set-Cookie']
                    # Extract cookie name=value from Set-Cookie header
                    if ';' in set_cookie:
                        cookie_parts.append(set_cookie.split(';')[0])
                    else:
                        cookie_parts.append(set_cookie)
                
                if cookie_parts:
                    session['user_cookie_string'] = '; '.join(cookie_parts)
                    
                # return jsonify({'result': dict(session)})
                return jsonify({'success': True})
        except Exception as e:
            pass
        
        return jsonify({'success': False, 'message': 'Tài khoản không tồn tại hoặc mật khẩu không đúng'})
    
    return render_template('login.html', version=APP_VERSION)

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    return jsonify({'success': True})


#========= PAGE ROUTES =========#
@app.route('/main')
def main():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('main.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/validate-scan-barcode')
def validate_scan_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('validate_scan_barcode.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/scan-barcode-history')
def scan_barcode_history():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('scan_barcode_history.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/print-barcode-history')
def print_barcode_history():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('print_barcode_history.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/reprint')
def reprint():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('reprint.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/substitutions')
def substitutions():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('substitutions.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/check-mesync')
def check_mesync():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('check_mesync.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/station-configuration')
def station_configuration():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('station_configuration.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/gitlab')
def gitlab():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return redirect(url_for('login'))
    return render_template('gitlab.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)

@app.route('/nes')
def nes():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('nes.html', user_id=session.get('user_id'), user_ip=session.get('user_ip'), version=APP_VERSION)


#========= API =========#
@app.route('/api/barcodes', methods=['POST'])
def search_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, product_id, product_type, 
               quantity, status, expiry_time, 
               created_at, updated_at, updated_by, created_by, 
               standing_time, feed_records_id, info, oid,
               reprint_reason, collected, erp_tire_barcode_synced
        FROM kvmes.material_resource
        WHERE id ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/recipes', methods=['POST'])
def search_work_order():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT
            r.id            AS recipe_id,
            r.product_type  AS product_type,
            r.product_id    AS product_id,
            r.released_at,
            cfg->'stations' AS stations,
            
            (
                SELECT jsonb_agg(mat)
                FROM jsonb_array_elements(cfg->'steps') step
                CROSS JOIN jsonb_array_elements(step->'materials') mat
            ) AS materials,

            (
                SELECT jsonb_agg(mat)
                FROM jsonb_array_elements(cfg->'steps') step
                CROSS JOIN jsonb_array_elements(step->'controls') mat
            ) AS controls,

            r.note,
            rpd.limitary_hour
            
        FROM kvmes.recipe r
        JOIN LATERAL jsonb_array_elements(r.processes::jsonb) proc ON TRUE
        JOIN kvmes.recipe_process_definition rpd ON rpd.oid = (proc->>'reference_oid')::uuid
        JOIN LATERAL jsonb_array_elements(rpd.configs::jsonb) cfg ON TRUE
        WHERE r.id LIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["released_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/feed_records', methods=['POST'])
def search_feed_record():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, product_id, product_type,
               quantity, status, expiry_time,
               created_at, updated_at, updated_by, created_by,
               standing_time, feed_records_id, info, oid,
               reprint_reason, collected, erp_tire_barcode_synced
        FROM kvmes.material_resource
        WHERE EXISTS (
            SELECT 1 FROM unnest(feed_records_id) AS elem
            WHERE elem ILIKE %s
        )
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/work-orders/get-details', methods=['POST'])
def get_work_order_by_id():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    work_order_id = request.json.get('work_order_id', '').strip()
    if not work_order_id:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, recipe_id, station, reserved_date::text AS reserved_date,
               status, process_type, department_id,
               process_name, reserved_sequence, information,
               updated_at, updated_by, created_at, created_by
        FROM kvmes.work_order
        WHERE id like %s
        ORDER BY reserved_date DESC;
    """

    result, column_names = execute_pg_select_query(query, (f"%{work_order_id}%",))
    if result:
        convert_columns = ["updated_at", "created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/station/scan-barcode-history', methods=['POST'])
def search_scan_barcode_history_by_station():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()
    station = request.json.get('station', '').strip()
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    params = [f"%{station}%"]
    
    if fromDate and toDate:
        params.extend([fromDate, toDate])

    query = """
        WITH base AS (
            SELECT
                a.station,
                a.name,
                a.content::jsonb,
                wo.recipe_id,

                to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                    AS updated_at_ts

            FROM kvmes.site_contents a
            JOIN kvmes.work_order wo
                ON wo.station = a.station
            JOIN kvmes.recipe_process_definition rpd
                ON rpd.recipe_id = wo.recipe_id

            WHERE a.station LIKE %s
            AND a.name <> ''
            AND to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                >= %s::date
            AND to_timestamp(a.updated_at::numeric / 1e9)
                    AT TIME ZONE 'Asia/Ho_Chi_Minh'
                <  (%s::date + INTERVAL '1 day')
        ),
        materials AS (
            SELECT
                b.recipe_id,
                b.station,
                b.name,
                b.updated_at_ts,

                b.content#>>'{slot,material,resource_id}' AS barcode,
                b.content#>>'{slot,material,material,id}' AS product_id
            FROM base b
            WHERE b.content ? 'slot'

            UNION ALL

            SELECT
                b.recipe_id,
                b.station,
                b.name,
                b.updated_at_ts,

                c->'material'->>'resource_id' AS barcode,
                c->'material'->'material'->>'id' AS product_id
            FROM base b
            CROSS JOIN LATERAL jsonb_array_elements(b.content->'container') c
            WHERE b.content ? 'container'
        )

        SELECT
            m.barcode,
            m.product_id,
            mr.quantity,
            to_char(MAX(m.updated_at_ts), 'YYYY-MM-DD HH24:MI:SS') AS last_updated_time,
            m.name,
            m.recipe_id,
            mr.expiry_time
        FROM materials m
        JOIN kvmes.recipe_process_definition rpd
            ON rpd.recipe_id = m.recipe_id
        LEFT JOIN kvmes.material_resource mr
            ON mr.id = m.barcode

        WHERE rpd.configs::jsonb @> jsonb_build_array(
                jsonb_build_object(
                    'steps', jsonb_build_array(
                        jsonb_build_object(
                            'materials', jsonb_build_array(
                                jsonb_build_object('name', m.product_id))))))

        GROUP BY
            m.barcode,
            m.product_id,
            m.recipe_id,
            m.name,
            mr.quantity,
            mr.expiry_time

        ORDER BY MAX(m.updated_at_ts) DESC
    """

    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["expiry_time"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/station/print-barcode-history', methods=['POST'])
def search_print_barcode_history_by_station():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()

    station = request.json.get('station', '').strip()
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    params = [f"%{station}%"]
    
    query = """
        WITH cr_ts AS (
            SELECT
                cr.work_order,
                cr.lot_number,
                to_char(cr.work_date, 'YYYY-MM-DD') AS work_date,
                cr.resource_oid,
                (cr.detail->>'quantity')::numeric AS quantity,
                cr.detail->>'operator_id' AS created_by,

                (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at_ts
            FROM kvmes.collect_record cr
            WHERE cr.station LIKE %s
        )

        SELECT
            mr.id,
            mr.product_id,
            cr.quantity,
            cr.work_order,
            cr.work_date,
            cr.lot_number,
            to_char(MAX(cr.created_at_ts), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
            cr.created_by
        FROM cr_ts cr
        JOIN kvmes.material_resource mr
            ON mr.oid = cr.resource_oid
        """
    
    query += """
        GROUP BY
            mr.id,
            mr.product_id,
            cr.quantity,
            cr.work_order,
            cr.work_date,
            cr.lot_number,
            cr.created_by
        """

    if fromDate and toDate:
        query += """
            HAVING
                MAX(cr.created_at_ts) >= %s::date
            AND
                MAX(cr.created_at_ts) <  %s::date + INTERVAL '1 day'
            """
        
        params.extend([fromDate, toDate])

    query += """
       ORDER BY MAX(cr.created_at_ts) DESC;
    """
    
    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
 
@app.route('/api/barcodes/scan-in-station', methods=['POST'])
def search_scan_barcode_history_by_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    resource_id = request.json.get('resource_id', '').strip()
    if not resource_id:
        return jsonify({'result': [], 'columns': []})
    
    params = [f"%{resource_id}%"]

    query = """
        SELECT *
        FROM (
            SELECT DISTINCT ON (rpd.oid)
                sv.station              AS station,
                sv.name                 AS site,
                sv.updated_at           AS scan_at,

                wo.id                   AS work_order_id,
                wo.status               AS work_order_status,
                wo.reserved_date::text  AS reserved_date,

                rpd.recipe_id,
                rpd.product_id,
                rpd.product_type
            FROM kvmes.site_view sv
            JOIN kvmes.recipe_process_definition rpd
            ON EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(rpd.configs::jsonb) cfg
                    WHERE cfg->'stations' ? sv.station
                )
            AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(rpd.configs::jsonb) cfg
                    CROSS JOIN jsonb_array_elements(cfg->'steps') step
                    CROSS JOIN jsonb_array_elements(step->'materials') mat
                    WHERE mat->>'name'
                        = sv.content->'slot'->'material'->'material'->>'id'
                    AND mat->>'site'
                        = sv.name
                )

            LEFT JOIN kvmes.work_order wo
            ON wo.recipe_id = rpd.recipe_id
            AND wo.station   = sv.station

            WHERE sv.content->'slot'->'material'->>'resource_id' LIKE %s
            AND wo.id IS NOT NULL
            AND wo.status <> 3

            ORDER BY
                rpd.oid,
                wo.updated_at DESC,
                sv.updated_at DESC
        ) sub
        ORDER BY scan_at DESC;
    """

    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["scan_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/barcodes/fetch-work-orders', methods=['POST'])
def fetch_work_order_by_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    fromDate = request.json.get('fromDate', '').strip()
    toDate = request.json.get('toDate', '').strip()
    resource_id = request.json.get('resource_id', '').strip()

    station = request.json.get('station', '').strip()
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    params = [resource_id]
    
    query = """
        SELECT
            wo.id                  AS work_order,
            wo.recipe_id,
            wo.status,
            wo.station,
            wo.reserved_date::text AS reserved_date,
            wo.updated_at,
            wo.updated_by,
            wo.created_at,
            wo.created_by,
            wo.information,
            wo.department_id,
            wo.reserved_sequence,
            wo.process_name,
            wo.process_type
        FROM kvmes.work_order wo
        WHERE EXISTS (
            SELECT 1
            FROM kvmes.collect_record cr
            JOIN kvmes.material_resource mr ON mr.oid = cr.resource_oid
                AND mr.id = %s
            WHERE cr.work_order = wo.id
        """
    if station:
        query += """
                AND cr.station LIKE %s
            """
        params.append(f"%{station}%")

    if fromDate and toDate:
        query += """
            AND (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                >= %s::date
            AND (
                    timestamp with time zone 'epoch'
                    + (cr.created_at / 1e9) * interval '1 second'
                ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
                < %s::date + INTERVAL '1 day'
            """
        
        params.extend([fromDate, toDate])
    
    query += """
            )
        """
    
    result, column_names = execute_pg_select_query(query, tuple(params))
    if result:
        convert_columns = ["created_at", "updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
          
@app.route('/api/barcodes/fetch-input-barcodes', methods=['POST'])
def get_input_barcode():
    data = request.json
    material_id = data.get('id')
    product_type = data.get('product_type')

    if not material_id or not product_type:
        return jsonify({'error': 'Missing id or product_type'}), 400

    try:
        query = """
            SELECT
                m_elem->'site'->>'name'            AS site_name,
                fr_elem->>'quantity'               AS quantity,
                fr_elem->>'product_id'             AS product_id,
                fr_elem->>'resource_id'            AS resource_id,
                m_elem->>'station'                 AS station
            FROM kvmes.material_resource mr
            JOIN kvmes.feed_record fr
                ON fr.id = ANY (mr.feed_records_id)
            CROSS JOIN LATERAL jsonb_array_elements(fr.materials) AS m_elem
            CROSS JOIN LATERAL jsonb_array_elements(m_elem->'feed_resources') AS fr_elem
            WHERE mr.id = %s
            AND mr.product_type = %s
        """

        result, column_names = execute_pg_select_query(query, (material_id, product_type))
        if result:
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names
            })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/barcodes/check-used-history', methods=['POST'])
def get_used_history_by_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    material_oid = request.json.get('material_oid')
    if not material_oid:
        return jsonify({'success': False, 'message': 'Thiếu material_oid'})
    
    material_type = request.json.get('material_type')
    if not material_type:
        return jsonify({'success': False, 'message': 'Thiếu material_type'})
    
    if material_type == "TIRE":
        return jsonify({'error': 'Không quản lý quét tem từ Ép Vỏ qua QC'}), 400

    try:
        query = """
        WITH params AS (
            SELECT
                %s::text AS resource_id,
                %s::text AS product_type
        )
        SELECT
            b.work_order,
            wo.recipe_id,
            wo.station,
            to_char(wo.reserved_date, 'YYYY-MM-DD') AS reserved_date,
            MAX(mat_elem->'value'->>'mid') AS consumption,
            
            /* ===== TOTAL BARCODE = Tổng số phần tử trong records_id (status = 2) ===== */
            SUM (
                CASE 
                    WHEN b.status = 2 THEN COALESCE(array_length(b.records_id, 1), 0)
                    ELSE 0
                END
            ) AS total_barcode,
            
            /* ===== TOTAL FAIL BARCODE (status = 1) ===== */
            SUM (
                CASE 
                    WHEN b.status = 1 THEN COALESCE(array_length(b.records_id, 1), 0)
                    ELSE 0
                END
            ) AS total_fail_barcode,
            
            /* ===== TOTAL CONSUMPTION = (total_barcode + total_fail_barcode) * consumption ===== */
            (
                SUM (
                    CASE 
                        WHEN b.status = 2 THEN COALESCE(array_length(b.records_id, 1), 0)
                        ELSE 0
                    END
                )
                + SUM (
                    CASE 
                        WHEN b.status = 1 THEN COALESCE(array_length(b.records_id, 1), 0)
                        ELSE 0
                    END
                )
            ) * MAX((mat_elem->'value'->>'mid')::numeric) AS total_consumption
                
        FROM params p
        JOIN kvmes.material_resource mr
            ON mr.id = p.resource_id
           AND mr.product_type = p.product_type
        JOIN kvmes.batch b ON TRUE
        JOIN kvmes.work_order wo ON wo.id = b.work_order
        JOIN kvmes.recipe_process_definition rpd
            ON rpd.recipe_id = wo.recipe_id
        LEFT JOIN LATERAL (
            SELECT material_elem AS mat_elem
            FROM jsonb_array_elements(rpd.configs::jsonb) cfg,
                 jsonb_array_elements(cfg->'steps') step,
                 jsonb_array_elements(step->'materials') material_elem
            WHERE material_elem->>'name' = mr.product_id
        ) m ON TRUE
        WHERE EXISTS (
            SELECT 1
            FROM kvmes.feed_record f
            WHERE f.id = ANY (b.records_id)
              AND jsonb_path_exists(
                    f.materials,
                    '$.** ? (@.resource_id == $rid)',
                    jsonb_build_object('rid', p.resource_id)
                )
        )
        GROUP BY
            b.work_order,
            wo.recipe_id,
            wo.station,
            wo.reserved_date,
            mr.product_id
        ORDER BY b.work_order;
        """

        result, column_names = execute_pg_select_query(query, (material_oid, material_type))
        if result:
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names
            })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/workorders/fetch-output-barcodes', methods=['POST'])
def fetch_output_barcode_by_work_order():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}

    work_order_id = data.get('work_order_id')
    if not work_order_id:
        return jsonify({'success': False, 'message': 'Thiếu Work Order ID'})

    work_order_status = data.get('work_order_status')
    if not work_order_status:
        return jsonify({'success': False, 'message': 'Thiếu Work Order Status'})

    if work_order_status == "0":
        return jsonify({'success': False, 'message': 'Đơn điều động chưa được sản xuất'})

    try:
        query = """
            SELECT
                mr.id AS barcode,
                cr.detail->>'quantity' AS quantity,
                cr.created_at,
                cr.lot_number,
                cr.station
            FROM kvmes.collect_record cr
            LEFT JOIN kvmes.material_resource mr
                ON mr.oid = cr.resource_oid
            WHERE cr.work_order = %s
            ORDER BY cr.sequence ASC
        """

        result, column_names = execute_pg_select_query(query, (work_order_id,))
        if not result:
            return jsonify({'success': False, 'message': 'Đơn điều động không có tem đầu ra'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(row) for row in result]

        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        })

@app.route('/api/barcodes/fetch-output-barcodes', methods=['POST'])
def get_output_barcode_by_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    resource_id = request.json.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    work_order = request.json.get('work_order')
    if not work_order:
        return jsonify({'success': False, 'message': 'Thiếu MES ID'})
    
    try:
        query = """
            SELECT
                mr.id,
                mr.product_id,
                mr.quantity,
                mr.status,
                mr.created_at,
                mr.info->>'lot_number' AS lot_number,
                mr.product_type
            FROM kvmes.material_resource mr
            JOIN kvmes.feed_record fr
                ON fr.id = ANY (mr.feed_records_id)
            JOIN kvmes.batch b
                ON fr.id = ANY (b.records_id)
            WHERE EXISTS (
                SELECT 1
                FROM jsonb_array_elements(fr.materials) AS material_elem
                JOIN jsonb_array_elements(material_elem->'feed_resources') AS feed_elem
                    ON TRUE
                WHERE feed_elem->>'resource_id' = %s
            )
            AND b.work_order = %s
            LIMIT 500;
        """
        
        result, column_names = execute_pg_select_query(query, (resource_id, work_order))
        if result:       
            convert_columns = ["expiry_time", "updated_at", "created_at", "standing_time"]
            result = convert_timestamp(result, column_names, convert_columns)
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names, 
                'message': 'Không tìm thấy tem đầu ra'
            })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/barcodes/check-transfer', methods=['POST'])
def check_barcode_transfer():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    resource_id = request.json.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    try:
        query = """
            SELECT
                mr.id AS barcode,
                lf.id AS from_location,
                lt.id AS to_location,
                mrt.created_at,
                mrt.created_by
            FROM kvmes.material_resource mr
            JOIN kvmes.material_resource_transaction mrt
                ON mr.oid = mrt.material_resource_oid
            LEFT JOIN kvmes.location lf 
                ON lf.oid = mrt.from_location_oid::INTEGER
            LEFT JOIN kvmes.location lt 
                ON lt.oid = mrt.to_location_oid::INTEGER
            WHERE mr.id = %s AND mrt.status = 'SUCCEEDED'
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        if not result:
            return jsonify({'success': False, 'message': 'Không tìm thấy dữ liệu vận chuyển'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        row = dict(zip(column_names, result[0]))

        message = (
            f"Barcode {resource_id} đã được chuyển từ {row.get('from_location')} qua {row.get('to_location')}, "
            f"lúc {row.get('created_at')} bởi {row.get('created_by')}"
        )

        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/barcodes/check-extend-date-count', methods=['POST'])
def check_barcode_extend_time():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    resource_id = request.json.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    try:
        query = """
            SELECT 
                info->>'deferrals_count' AS count_extend_date,
                info->>'change_log' AS change_log
            FROM kvmes.material_resource
            WHERE id = %s;
        """
        result, column_names = execute_pg_select_query(query, (resource_id,))
        
        if not result:
            return jsonify({'success': False, 'message': 'Không tìm thấy barcode'})

        row = dict(zip(column_names, result[0]))
        count_extend = row.get('count_extend_date', '0')
        change_log_str = row.get('change_log', '[]')
        
        # Parse change_log JSON
        try:
            if isinstance(change_log_str, str):
                change_log = json.loads(change_log_str)
            else:
                change_log = change_log_str if change_log_str else []
        except json.JSONDecodeError:
            change_log = []
        
        # Build message
        if count_extend == "0" or not change_log:
            message = (
                f"Barcode {resource_id} chưa được gia hạn lần nào!\n"
                f"(Tối đa 2 lần)"
            )
        else:
            message_parts = [
                f"Barcode {resource_id} đã gia hạn {count_extend} lần!"
            ]
            
            # Add each extension detail
            for idx, log_entry in enumerate(change_log, start=1):
                updated_at = log_entry.get('updated_at')
                updated_by = log_entry.get('updated_by', 'N/A')
                
                # Convert timestamp to datetime
                if updated_at:
                    # Convert nanoseconds to datetime
                    formatted_time = convert_timestamp(updated_at)
                    message_parts.append(
                        f"Lần {idx} lúc {formatted_time} bởi {updated_by}"
                    )
            
            message_parts.append("(Tối đa 2 lần)")
            message = '\n'.join(message_parts)

        return jsonify({'success': True, 'message': message})
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/departments', methods=['GET'])
def get_department_list():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({
            'error': True,
            'code': 'UNAUTHORIZED',
            'message': 'User not logged in'
        }), 401
    
    url = 'https://198.1.10.85:8810/api/departments'
    headers = get_auth_headers(session)
    
    try:
        response = requests.get(url, headers=headers, verify=False)

        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, dict) and 'data' in data:
            return jsonify({
                'error': False,
                'data': data['data']
            })
        
        if isinstance(data, list):
            return jsonify({
                'error': False,
                'data': data
            })
        
        return jsonify({
            'error': False,
            'data': []
        })
    
    except Exception as e:
        return jsonify({
            'error': True,
            'code': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/departments/stations', methods=['POST'])
def get_station_list_by_department():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_token = session.get('user_token')
    if not user_token:
        return jsonify({'error': 'Unauthorized'}), 401
    
    department_oid = request.json.get('department_oid', '').strip()
    if not department_oid:
        return jsonify({'stations': []})
    
    url = f'https://198.1.10.85:8810/api/station-list/department-oid/{department_oid}'
    headers = get_auth_headers(session)
    
    try:
        response = requests.get(url, headers=headers, verify=False)
        data = response.json()
        stations = []
        if data.get('data'):
            for item in data['data']:
                stations.append({
                    'id': item.get('ID', ''),
                    'name': item.get('name', '')
                })
        return jsonify({'stations': stations})
    except requests.RequestException as e:
        return jsonify({'stations': [], 'error': str(e)})

@app.route('/api/work-orders/get-active-list', methods=['POST'])
def get_active_work_order_list():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    station = request.json.get('station', '').strip()
    
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, recipe_id, department_id, station, status, reserved_date::text AS reserved_date,
                created_at, updated_at, updated_by
        FROM kvmes.work_order
        WHERE station = %s
        AND status = 1
        ORDER BY reserved_sequence
    """
    
    try:
        result, column_names = execute_pg_select_query(query, (station, ))
        convert_columns = ["created_at", "updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({'result': serialized_result, 'columns': column_names})
    except Exception as e:
        return jsonify({'result': [], 'columns': [], 'error': str(e)})

@app.route('/api/stations/validate-scan-barcode', methods=['POST'])
def validate_scan_barcode_by_station():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    recipe_id = request.json.get('recipe_id', '').strip()
    station = request.json.get('station', '').strip()
    
    if not recipe_id or not station:
        return jsonify({'success': False, 'message': 'Thiếu thông tin'})
    
    try:
        # Get recipe configs
        recipe_query = """
            SELECT oid, recipe_id, name, type, configs, product_id, product_type, limitary_hour
            FROM kvmes.recipe_process_definition
            WHERE recipe_id = %s
        """

        recipe_result, recipe_columns = execute_pg_select_query(recipe_query, (recipe_id,))
        
        if not recipe_result:
            return jsonify({'success': False, 'message': 'Không tìm thấy recipe'})
        
        recipe_configs = recipe_result[0][recipe_columns.index('configs')]
        
        # Parse configs to get materials from steps
        recipe_materials = []
        if recipe_configs:
            try:
                if isinstance(recipe_configs, str):
                    configs_data = json.loads(recipe_configs)
                else:
                    configs_data = recipe_configs
                
                if isinstance(configs_data, list) and len(configs_data) > 0:
                    steps = configs_data[0].get('steps', [])
                    if steps and len(steps) > 0:
                        materials = steps[0].get('materials', [])
                        for mat in materials:
                            recipe_materials.append({
                                'name': mat.get('name', ''),
                                'site': mat.get('site', '')
                            })
            except Exception as e:
                return jsonify({'success': False, 'message': f'Lỗi parse configs: {str(e)}'})
            
        # Get site_view data
        site_query = """
            SELECT station, name, content, updated_at, updated_by
            FROM kvmes.site_view
            WHERE station = %s
        """
        site_result, site_columns = execute_pg_select_query(site_query, (station,))
        
        site_materials = []
        for row in site_result:
            row_dict = dict(zip(site_columns, row))
            name = row_dict.get('name', '')
            content = row_dict.get('content', '')
            
            if content:
                try:
                    if isinstance(content, str):
                        content_data = json.loads(content)
                    else:
                        content_data = content
                    
                    slot = content_data.get('slot', {})
                    material = slot.get('material', {})
                    material_obj = material.get('material', {})
                    
                    material_id = material_obj.get('id', '')
                    resource_id = material.get('resource_id', '')
                    
                    site_materials.append({
                        'name': name,
                        'id': material_id,
                        'barcode': resource_id
                    })
                except Exception as e:
                    continue

        # Compare and match
        comparison_result = []
        for recipe_mat in recipe_materials:
            recipe_name = recipe_mat['name']
            recipe_site = recipe_mat['site']
            
            # Find matching site material
            matched = False
            for site_mat in site_materials:
                if site_mat['name'] == recipe_site:
                    matched = True
                    is_match = (recipe_name == site_mat['id'])
                    comparison_result.append([
                        recipe_site,           # site
                        recipe_name,           # recipe_name
                        site_mat['id'],        # site_id
                        site_mat['barcode'],   # site_barcode
                        is_match,              # match
                        None,                   # expiry_time
                        None                    # quantity
                    ])
                    break
            
            if not matched:
                comparison_result.append([
                    recipe_site,    # site
                    recipe_name,    # recipe_name
                    None,           # site_id
                    None,           # site_barcode
                    False,          # match
                    None,            # expiry_time
                    None             # quantity
                ])
        
        # Get expiry_time for each barcode
        for item in comparison_result:
            site_barcode = item[3]  # index 3 is site_barcode
            if site_barcode:
                expiry_query = """
                    SELECT expiry_time, quantity
                    FROM kvmes.material_resource
                    WHERE id = %s
                """
                expiry_result, expiry_columns = execute_pg_select_query(expiry_query, (site_barcode,))
                
                if expiry_result and len(expiry_result) > 0:
                    item[5] = expiry_result[0][0]  # expiry_time
                    item[6] = expiry_result[0][1]  # quantity
        
        # Convert timestamp columns (expiry_time is at index 5)
        column_names = ['site', 'recipe_name', 'site_id', 'site_barcode', 'match', 'expiry_time', 'quantity']
        convert_columns = ['expiry_time']
        comparison_result = convert_timestamp(comparison_result, column_names, convert_columns)
        
        # Serialize the result
        serialized_result = [serialize_row(list(row)) for row in comparison_result]
        
        # Rebuild as list of dictionaries
        final_result = []
        for row in serialized_result:
            final_result.append({
                'site': row[0],
                'recipe_name': row[1],
                'site_id': row[2],
                'site_barcode': row[3],
                'match': row[4],
                'expiry_time': row[5],
                'quantity': row[6]
            })
        
        return jsonify({
            'success': True,
            'result': final_result
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})
    
@app.route('/api/barcodes/get-reprint-list', methods=['POST'])
def get_reprint_barcode_list():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    from_date = request.json.get('from_date', '').strip()
    to_date = request.json.get('to_date', '').strip()

    if not from_date or not to_date:
        return jsonify({'result': [], 'columns': []})

    url = 'https://198.1.10.85:8810/api/resources/materials'
    params = {
        'reprintReason': -1,
        'createdAfter': from_date,
        'createdBefore': to_date
    }

    headers = get_auth_headers(session)

    try:
        response = requests.get(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        data = response.json()

        items = data.get('data', {}).get('items', [])
        if not items:
            return jsonify({'result': [], 'columns': []})

        DISPLAY_COLUMNS = [
            'ID',
            'resourceID',
            'quantity',
            'status',
            'reprintReason',
            'createdAt',
            'createdBy',
            'productType'
        ]
        
        DATE_COLUMNS = {
            'createdAt'
        }

        columns = DISPLAY_COLUMNS

        result = []
        for item in items:
            row = []
            for col in columns:
                value = item.get(col)

                if col in DATE_COLUMNS and isinstance(value, str):
                    value = convert_iso_datetime(value)
                
                if isinstance(value, (dict, list)):
                    row.append(json.dumps(value, ensure_ascii=False))
                else:
                    row.append(value)

            result.append(row)

        return jsonify({
            'result': result,
            'columns': columns
        })

    except Exception as e:
        return jsonify({
            'error': True,
            'code': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/barcodes/get-substitutions-list', methods=['POST'])
def search_substitutions():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT id, substitutions, updated_at, updated_by
	    FROM kvmes.substitution_mapping
        WHERE id ILIKE %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })
    
@app.route('/api/recipes/fetch-work-orders', methods=['POST'])
def fetch_work_order_by_recipe():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    recipe_id = request.json.get('recipe_id')
    if not recipe_id:
        return jsonify({'success': False, 'message': 'Thiếu Recipe ID'})
    
    try:
        query = """
            SELECT  id AS work_order, recipe_id, status, station, 
                    reserved_date::text AS reserved_date, 
                    updated_at, updated_by, created_at, created_by,
                    information, department_id, reserved_sequence,
                    process_name, process_type
            FROM kvmes.work_order
            WHERE recipe_id LIKE %s
            ORDER BY reserved_date DESC
            LIMIT 100;
        """
        
        result, column_names = execute_pg_select_query(query, (recipe_id, ))
        if result:       
            convert_columns = ["updated_at", "created_at"]
            result = convert_timestamp(result, column_names, convert_columns)
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names, 
                'message': 'Không tìm thấy mã MES'
            })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/fetch-commit-gitlab', methods=['POST'])
def fetch_commit_gitlab():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    global gitlab_private_token

    recipe_id = request.json.get('recipe_id', '').strip()
    product_type = request.json.get('product_type', '').strip()

    if not recipe_id or not product_type:
        return jsonify({'success': False, 'message': 'Thiếu recipe_id hoặc product_type'})

    CBK = {
        'BEAD', 'BEAD_AND_BEAD_FILLER_PREASSEMBLY', 'BEAD_WIRE', 'BEAD_FILLER',
        'CARCASS_PLY', 'CAP_PLY', 'CHAFER', 'INNER_LINER', 'PLY',
        'SIDEWALL', 'SQUEEZE', 'STEEL_BELT', 'STEEL_WIRE', 'TREAD'
    }

    if product_type == 'GREEN_TIRE':
        project_id = 133
    elif product_type == 'TIRE':
        project_id = 134
    elif product_type in CBK:
        project_id = 135
    else:
        project_id = 136

    session['current_gitlab_project_id'] = project_id

    headers = {
        'PRIVATE-TOKEN': gitlab_private_token
    }

    try:
        # Step 1: Search for the yaml file in GitLab
        search_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/search'
        search_params = {
            'scope': 'blobs',
            'search': recipe_id
        }

        search_response = requests.get(search_url, headers=headers, params=search_params, verify=False)
        search_response.raise_for_status()
        search_data = search_response.json()

        if not search_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy file yaml ở gitlab'})

        # Get file path from first result
        path = search_data[0].get('path', '')
        if not path:
            return jsonify({'success': False, 'message': 'Không tìm thấy path của file yaml'})

        # Step 2: URL-encode the path (replace / with %2F)
        encoded_path = path.replace('/', '%2F')

        # Step 3: Fetch blame (commit history) for the file
        blame_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}/blame'
        blame_params = {'ref': 'master'}

        blame_response = requests.get(blame_url, headers=headers, params=blame_params, verify=False)
        blame_response.raise_for_status()
        blame_data = blame_response.json()

        if not blame_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy lịch sử commit'})

        # Step 4: Extract unique commits (deduplicate by commit id)
        column_names = [
            'message', 'authored_date', 'author_name', 'author_email', 
            'committed_date', 'committer_name', 'committer_email', 'id'
        ]

        seen_commit_ids = set()
        result = []

        for blame_entry in blame_data:
            commit = blame_entry.get('commit', {})
            commit_id = commit.get('id', '')

            if commit_id in seen_commit_ids:
                continue
            seen_commit_ids.add(commit_id)

            row = [
                commit.get('message', ''),
                commit.get('authored_date', ''),
                commit.get('author_name', ''),
                commit.get('author_email', ''),
                commit.get('committed_date', ''),
                commit.get('committer_name', ''),
                commit.get('committer_email', ''),
                commit_id,
            ]
            result.append(row)

        result.sort(key=lambda row: row[column_names.index('authored_date')] or '', reverse=True)
        
        if result:
            convert_columns = ['authored_date', 'committed_date']
            
            new_result = []
            for row in result:
                row_list = list(row)
                for col in convert_columns:
                    if col in column_names:
                        idx = column_names.index(col)
                        row_list[idx] = convert_iso_datetime(str(row_list[idx])) if row_list[idx] else None
                new_result.append(tuple(row_list))
            
            serialized_result = [serialize_row(list(row)) for row in new_result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names,
                'message': 'Không tìm thấy commit nào'
            })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/commit-gitlab/details', methods=['POST'])
def fetch_commit_gitlab_details():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    global gitlab_private_token

    commit_id = request.json.get('commit_id', '').strip()
    if not commit_id:
        return jsonify({'success': False, 'message': 'Thiếu commit_id'})

    project_id = session.get('current_gitlab_project_id')
    if not project_id:
        return jsonify({'success': False, 'message': 'Chưa có project_id, vui lòng tải danh sách commit trước'})

    headers = {
        'PRIVATE-TOKEN': gitlab_private_token
    }

    try:
        diff_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/commits/{commit_id}/diff'

        diff_response = requests.get(diff_url, headers=headers, verify=False)
        diff_response.raise_for_status()
        diff_data = diff_response.json()

        if not diff_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy diff cho commit này'})

        column_names = [
            'diff', 'new_path', 'old_path',
            'new_file', 'renamed_file', 'deleted_file'
        ]

        result = []
        for item in diff_data:
            row = [
                item.get('diff', ''),
                item.get('new_path', ''),
                item.get('old_path', ''),
                item.get('new_file', False),
                item.get('renamed_file', False),
                item.get('deleted_file', False)
            ]
            result.append(row)

        if result:
            serialized_result = [serialize_row(list(row)) for row in result]
            return jsonify({
                'success': True,
                'result': serialized_result,
                'columns': column_names
            })
        else:
            return jsonify({
                'success': True,
                'result': [],
                'columns': column_names,
                'message': 'Không có thay đổi trong commit này'
            })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})

@app.route('/api/recipes/fetch-yaml-content', methods=['POST'])
def fetch_yaml_content():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    global gitlab_private_token

    recipe_id = request.json.get('recipe_id', '').strip()
    product_type = request.json.get('product_type', '').strip()

    if not recipe_id or not product_type:
        return jsonify({'success': False, 'message': 'Thiếu recipe_id hoặc product_type'})

    CBK = {
        'BEAD', 'BEAD_AND_BEAD_FILLER_PREASSEMBLY', 'BEAD_WIRE', 'BEAD_FILLER',
        'CARCASS_PLY', 'CAP_PLY', 'CHAFER', 'INNER_LINER', 'PLY',
        'SIDEWALL', 'SQUEEZE', 'STEEL_BELT', 'STEEL_WIRE', 'TREAD'
    }

    if product_type == 'GREEN_TIRE':
        project_id = 133
    elif product_type == 'TIRE':
        project_id = 134
    elif product_type in CBK:
        project_id = 135
    else:
        project_id = 136

    headers = {
        'PRIVATE-TOKEN': gitlab_private_token
    }

    try:
        search_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/search'
        search_params = {
            'scope': 'blobs',
            'search': recipe_id
        }

        search_response = requests.get(search_url, headers=headers, params=search_params, verify=False)
        search_response.raise_for_status()
        search_data = search_response.json()

        if not search_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy file yaml ở gitlab'})

        path = search_data[0].get('path', '')
        if not path:
            return jsonify({'success': False, 'message': 'Không tìm thấy path của file yaml'})

        encoded_path = path.replace('/', '%2F')

        file_url = f'https://gitlabce.kenda.com.tw/api/v4/projects/{project_id}/repository/files/{encoded_path}'
        file_params = {'ref': 'master'}

        file_response = requests.get(file_url, headers=headers, params=file_params, verify=False)
        file_response.raise_for_status()
        file_data = file_response.json()

        if not file_data:
            return jsonify({'success': False, 'message': 'Không tìm thấy nội dung file yaml'})

        content_b64 = file_data.get('content', '')
        if not content_b64:
            return jsonify({'success': False, 'message': 'File yaml không có nội dung'})

        content_decoded = base64.b64decode(content_b64).decode('utf-8')

        return jsonify({
            'success': True,
            'content': content_decoded,
            'file_path': path,
            'file_name': file_data.get('file_name', ''),
            'last_commit_id': file_data.get('last_commit_id', ''),
        })

    except requests.RequestException as e:
        return jsonify({'success': False, 'message': f'Lỗi kết nối GitLab: {str(e)}'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Lỗi: {str(e)}'})
    
@app.route('/api/barcodes/fetch-original-info', methods=['POST'])
def fetch_original_info_by_barcode():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json() or {}

    resource_id = data.get('resource_id')
    if not resource_id:
        return jsonify({'success': False, 'message': 'Thiếu Resource ID'})
    
    product_type = data.get('product_type')

    try:
        query = """
            WITH params AS (
                SELECT
                    %s::text AS material_id,
                    %s::text AS product_type
            ),

            target_work_orders AS (
                SELECT DISTINCT
                    wo.id AS work_order,
                    wo.recipe_id
                FROM params p
                JOIN kvmes.work_order wo ON TRUE
                WHERE EXISTS (
                    SELECT 1
                    FROM kvmes.collect_record cr
                    JOIN kvmes.material_resource mr
                        ON mr.oid = cr.resource_oid
                    AND mr.id = p.material_id
                    AND (p.product_type IS NULL OR mr.product_type = p.product_type)
                    WHERE cr.work_order = wo.id
                )
            )

            SELECT
                mr.id              			AS barcode,
                cr.detail->>'quantity' 		AS quantity,
                cr.work_date::text       	AS work_date,
                cr.detail->>'shift_group'	AS shift_group,
                cr.lot_number,
                cr.station         			AS station,
                cr.created_at,
                cr.detail->>'operator_id'	AS created_by

            FROM params p
            JOIN target_work_orders tw
                ON TRUE
            JOIN kvmes.work_order wo
                ON wo.id = tw.work_order
            JOIN kvmes.collect_record cr
                ON cr.work_order = wo.id
            JOIN kvmes.material_resource mr
                ON mr.oid = cr.resource_oid
            AND mr.id = p.material_id
            AND (p.product_type IS NULL OR mr.product_type = p.product_type)

            ORDER BY
                wo.reserved_date DESC,
                cr.sequence ASC;
        """

        result, column_names = execute_pg_select_query(query, (resource_id, product_type))
        if not result:
            return jsonify({'success': False, 'message': 'Lỗi API'})

        convert_columns = ["created_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(row) for row in result]

        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi: {str(e)}'
        })
    
@app.route('/api/mesync/get-mesync-inbox-events', methods=['POST'])
def get_mesync_inbox_events():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    keyword = request.json.get('keyword', '').strip()
    if not keyword:
        return jsonify({'result': [], 'columns': []})

    query = """
        SELECT event_type, payload, status, retry_count, 
            next_retry_at, created_at, last_error
        FROM kvmes.mesync_inbox_events
        WHERE payload::text ILIKE %s
        ORDER BY created_at desc
        LIMIT 200;
    """

    result, column_names = execute_pg_select_query(query, (f"%{keyword}%",))
    if result:
        convert_columns = ["next_retry_at", "created_at"]
        
        new_result = []
        for row in result:
            row_list = list(row)
            for col in convert_columns:
                if col in column_names:
                    idx = column_names.index(col)
                    row_list[idx] = convert_iso_datetime(str(row_list[idx])) if row_list[idx] else None
            new_result.append(tuple(row_list))
        
        serialized_result = [serialize_row(list(row)) for row in new_result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.route('/api/barcodes/get-station-configuration-list', methods=['POST'])
def get_station_configuration_list():
    if 'user_id' not in session or 'user_token' not in session or 'user_ip' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    station = request.json.get('station', '').strip()
    
    if not station:
        return jsonify({'result': [], 'columns': []})
    
    query = """
        SELECT station_id, production, ui, updated_at, updated_by
	    FROM kvmes.station_configuration
        WHERE station_id = %s
        LIMIT 100;
    """
    result, column_names = execute_pg_select_query(query, (station, ))
    if result:
        convert_columns = ["updated_at"]
        result = convert_timestamp(result, column_names, convert_columns)
        serialized_result = [serialize_row(list(row)) for row in result]
        return jsonify({
            'success': True,
            'result': serialized_result,
            'columns': column_names
        })
    else:
        return jsonify({
            'success': True,
            'result': [],
            'columns': column_names
        })

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404
   
if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)