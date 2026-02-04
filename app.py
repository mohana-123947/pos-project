from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import uuid
from datetime import datetime

# 1. APP INITIALIZE
app = Flask(__name__)
CORS(app)

# 2. FOLDER SETUP (Images-ku)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static/uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16MB Limit

# 3. DATABASE SETUP (SQLite)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'pos.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- DATABASE MODELS ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, default=0)
    image_path = db.Column(db.String(255), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'price': self.price,
            'stock': self.stock,
            'img': f"/static/uploads/{self.image_path}" if self.image_path else "https://via.placeholder.com/100"
        }

class Sale(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.String(50), unique=True, nullable=False)
    customer_name = db.Column(db.String(100), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(50), nullable=False)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    items = db.relationship('SaleItem', backref='sale', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'invoiceId': self.invoice_id,
            'customerName': self.customer_name,
            'customerPhone': self.customer_phone,
            'total': self.total_amount,
            'paymentMethod': self.payment_method,
            'date': self.date_created.isoformat(),
            'items': [i.to_dict() for i in self.items],
            'subtotal': self.total_amount / 1.05 
        }

class SaleItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sale.id'), nullable=False)
    product_name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Float, nullable=False)
    qty = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {
            'name': self.product_name,
            'price': self.price,
            'qty': self.qty,
            'id': 0 
        }

# --- DATABASE CREATE (AUTO) ---
with app.app_context():
    db.create_all()
    # Admin User Check
    if not User.query.filter_by(username='admin').first():
        admin = User(username='admin', password='admin')
        db.session.add(admin)
        db.session.commit()
        print(">>> Database & Admin User Created Successfully!")

# --- ROUTES ---
@app.route('/')
def home():
    return render_template('index.html')

from flask import request, redirect, url_for, render_template
@app.route('/login', methods=['POST'])
def login():
        username = request.form['username']
        password = request.form['password']
        
        # TEMP DEMO LOGIN
        if username == 'admin' and password == 'admin':
            return redirect(url_for('dashboard'))
        else:
            return render_template('index.html', error="Invalid credentials")
        @app.route('/dashboard')
        def dashboard():
                return render_template('dashboard.html')

@app.route('/api/products', methods=['GET', 'POST'])
def handle_products():
    if request.method == 'GET':
        products = Product.query.all()
        return jsonify([p.to_dict() for p in products])
    
    if request.method == 'POST':
        data = request.form
        img_file = request.files.get('image')
        img_path = None
        
        # Ensure Upload folder exists
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'])

        if img_file:
            filename = secure_filename(str(uuid.uuid4()) + "_" + img_file.filename)
            img_file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            img_path = filename

        new_product = Product(
            name=data['name'],
            category=data['category'],
            price=float(data['price']),
            stock=int(data['stock']),
            image_path=img_path
        )
        db.session.add(new_product)
        db.session.commit()
        return jsonify(new_product.to_dict()), 201

@app.route('/api/products/<int:id>', methods=['PUT', 'DELETE'])
def modify_product(id):
    product = Product.query.get_or_404(id)
    if request.method == 'PUT':
        data = request.form
        product.name = data.get('name', product.name)
        product.category = data.get('category', product.category)
        product.price = float(data.get('price', product.price))
        product.stock = int(data.get('stock', product.stock))
        
        img_file = request.files.get('image')
        if img_file:
            filename = secure_filename(str(uuid.uuid4()) + "_" + img_file.filename)
            img_file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            product.image_path = filename
            
        db.session.commit()
        return jsonify(product.to_dict())

    if request.method == 'DELETE':
        db.session.delete(product)
        db.session.commit()
        return jsonify({'message': 'Deleted'})

@app.route('/api/checkout', methods=['POST'])
def checkout():
    data = request.json
    invoice_id = str(uuid.uuid4())[:6]
    
    new_sale = Sale(
        invoice_id=invoice_id,
        customer_name=data['customerName'],
        customer_phone=data['customerPhone'],
        total_amount=data['total'],
        payment_method=data['paymentMethod']
    )
    db.session.add(new_sale)
    
    for item in data['items']:
        sale_item = SaleItem(
            sale=new_sale,
            product_name=item['name'],
            price=item['price'],
            qty=item['qty']
        )
        db.session.add(sale_item)
        product = Product.query.get(item['id'])
        if product:
            product.stock -= item['qty']

    db.session.commit()
    return jsonify(new_sale.to_dict()), 201

@app.route('/api/stats', methods=['GET'])
def get_stats():
    today = datetime.now().date()
    current_month = datetime.now().month
    current_year = datetime.now().year
    sales = Sale.query.all()
    
    today_sales = sum(s.total_amount for s in sales if s.date_created.date() == today)
    monthly_sales = sum(s.total_amount for s in sales if s.date_created.month == current_month and s.date_created.year == current_year)
    total_revenue = sum(s.total_amount for s in sales)
    total_bills = len(sales)
    low_stock_count = Product.query.filter(Product.stock < 5).count()

    return jsonify({
        'today': today_sales,
        'month': monthly_sales,
        'revenue': total_revenue,
        'bills': total_bills,
        'lowStock': low_stock_count
    })

@app.route('/api/sales', methods=['GET'])
def get_sales():
    sales = Sale.query.order_by(Sale.date_created.desc()).all()
    return jsonify([s.to_dict() for s in sales])

if __name__ == "__main__":
        app.run(host="0.0.0.0", port=10000)