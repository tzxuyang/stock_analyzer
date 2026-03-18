import tushare as ts
import pandas as pd

# 1. Initialize API with your token
# Get your token at https://tushare.pro/user/token
pro = ts.pro_api('e15866b00cc95a57d3d1e3a0b3d20ac1a0160e6ff1b914ec9d24f66a')

# 2. Get daily price data (e.g., Ping An Bank 000001.SZ)
df = pro.daily(ts_code='000001.SZ', start_date='20240101', end_date='20240315')
df = pro.daily(ts_code='000001.SZ', start_date='20240101', end_date='20240315')
# df = pro.fund_daily(ts_code='512890.SH', start_date='20240101', end_date='20240315')
print(df)


# pro = ts.pro_api()

# #设置你的token
# df = pro.user(token='e15866b00cc95a57d3d1e3a0b3d20ac1a0160e6ff1b914ec9d24f66a')

# print(df)