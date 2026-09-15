#!/usr/bin/env python3
"""Kaveri Academy - 20 Python mini projects (seed generator + local validator).

Each project: id, title, topic, question, starter_code, solution, tests.
A test is (stdin_lines, expected_stdout_lines, hidden).
Run modes:
  python scripts/mini_projects.py check     -> validate every vector vs reference solution
  python scripts/mini_projects.py seed      -> emit idempotent SQL to stdout
"""
import subprocess, sys, json, re

PROMPT = "Enter "

def strip_prompts(code):
    """input("prompt: ") prints the prompt to stdout, polluting graded output.
    Graded I/O follows the clean Input/Output examples, so solutions and
    starters must use bare input()."""
    return re.sub(r'input\(\s*"[^"]*"\s*\)', 'input()', code)

def proj(pid, title, topic, question, starter, solution, tests):
    return dict(id=pid, title=title, topic=topic, question=question,
                starter=strip_prompts(starter), solution=strip_prompts(solution),
                tests=tests)

def t(inp, out, hidden=False):
    return dict(inp=inp, out=out, hidden=hidden)

PROJECTS = []

# 1 ----------------------------------------------------------------- BMI
PROJECTS.append(proj(
    "mini-01-bmi-calculator", "Mini Project 1: BMI Calculator", "Mini Projects",
    """Build your own BMI (Body Mass Index) calculator.

The program reads two lines from input:
Line 1: weight in kilograms (a number, may have decimals)
Line 2: height in centimeters (a number, may have decimals)

BMI formula: BMI = weight / (height_in_meters * height_in_meters)

Print EXACTLY two lines:
Your BMI is: <bmi rounded to 1 decimal place>
Category: <category>

Category rules:
- BMI < 18.5   -> Underweight
- 18.5 to 24.9 -> Normal weight
- 25.0 to 29.9 -> Overweight
- 30.0 or more -> Obese

Example
Input:
70
175
Output:
Your BMI is: 22.9
Category: Normal weight""",
    "# BMI Calculator\n# Read weight (kg) and height (cm), print BMI and category.\nweight = float(input(\"Enter your weight in kg: \"))\n# TODO: read height in cm, compute BMI, print the two required lines\n",
    'weight = float(input("Enter your weight in kg: "))\nheight_cm = float(input("Enter your height in cm: "))\nbmi = weight / ((height_cm / 100) ** 2)\nprint(f"Your BMI is: {bmi:.1f}")\nif bmi < 18.5:\n    print("Category: Underweight")\nelif bmi < 25.0:\n    print("Category: Normal weight")\nelif bmi < 30.0:\n    print("Category: Overweight")\nelse:\n    print("Category: Obese")\n',
    [t(["70", "175"], ["Your BMI is: 22.9", "Category: Normal weight"]),
     t(["45", "160"], ["Your BMI is: 17.6", "Category: Underweight"]),
     t(["82.5", "170"], ["Your BMI is: 28.5", "Category: Overweight"]),
     t(["95", "150"], ["Your BMI is: 42.2", "Category: Obese"], hidden=True),
     t(["61.2", "183.5"], ["Your BMI is: 18.2", "Category: Underweight"], hidden=True),
     t(["68.4", "165.2"], ["Your BMI is: 25.1", "Category: Overweight"], hidden=True)]))

# 2 ---------------------------------------------------------- simple interest
PROJECTS.append(proj(
    "mini-02-interest-calculator", "Mini Project 2: Simple Interest Calculator", "Mini Projects",
    """Build a Simple Interest calculator for a small finance shop.

Input (three lines):
Line 1: principal amount P (a number)
Line 2: yearly rate of interest R (a number, percent)
Line 3: time period T in years (a number)

Simple Interest SI = (P * R * T) / 100
Total amount = P + SI

Print EXACTLY two lines:
Simple Interest: <SI rounded to 2 decimals>
Total Amount: <total rounded to 2 decimals>

Example
Input:
10000
7.5
3
Output:
Simple Interest: 2250.0
Total Amount: 12250.0

Note: use round(x, 2) for rounding. If SI has no fraction (like 2250.0) Python
prints 2250.0 - that exact format is expected.""",
    "# Simple Interest Calculator\nP = float(input(\"Enter principal: \"))\n# TODO: read R and T, compute SI and total, print both lines\n",
    'P = float(input("Enter principal: "))\nR = float(input("Enter rate: "))\nT = float(input("Enter time: "))\nsi = round(P * R * T / 100, 2)\ntotal = round(P + si, 2)\nprint(f"Simple Interest: {si}")\nprint(f"Total Amount: {total}")\n',
    [t(["10000", "7.5", "3"], ["Simple Interest: 2250.0", "Total Amount: 12250.0"]),
     t(["5000", "10", "2"], ["Simple Interest: 1000.0", "Total Amount: 6000.0"]),
     t(["25000", "8.4", "5"], ["Simple Interest: 10500.0", "Total Amount: 35500.0"]),
     t(["1234.5", "6.25", "2.5"], ["Simple Interest: 192.89", "Total Amount: 1427.39"], hidden=True),
     t(["999", "3.3", "1"], ["Simple Interest: 32.97", "Total Amount: 1031.97"], hidden=True),
     t(["100000", "2", "10"], ["Simple Interest: 20000.0", "Total Amount: 120000.0"], hidden=True)]))

# 3 ------------------------------------------------------- unit converter
PROJECTS.append(proj(
    "mini-03-unit-converter", "Mini Project 3: Unit Converter (km/miles & C/F)", "Mini Projects",
    """Build a unit converter that works in two modes.

Input (two lines):
Line 1: the choice - the number 1 or the number 2
Line 2: the value to convert (a number, may have decimals)

Mode 1: kilometers -> miles.  miles = km * 0.621371
Mode 2: Celsius -> Fahrenheit.  f = (c * 9/5) + 32

Print EXACTLY one line:
For mode 1: <km> km = <miles rounded to 2 decimals> miles
For mode 2: <c> degrees Celsius = <f rounded to 1 decimal place> degrees Fahrenheit

Print the input value as the user typed it (for 5 print 5, for 2.5 print 2.5).

Example
Input:
1
5
Output:
5 km = 3.11 miles

Example
Input:
2
37
Output:
37 degrees Celsius = 98.6 degrees Fahrenheit""",
    "# Unit Converter\nchoice = input(\"Enter choice (1 = km to miles, 2 = C to F): \")\n# TODO: read the value, convert based on choice, print exactly one line\n",
    'choice = input("Enter choice (1 = km to miles, 2 = C to F): ")\nvalue = input("Enter value: ")\nnum = float(value)\nif choice == "1":\n    miles = round(num * 0.621371, 2)\n    print(f"{value} km = {miles} miles")\nelse:\n    f = round((num * 9 / 5) + 32, 1)\n    print(f"{value} degrees Celsius = {f} degrees Fahrenheit")\n',
    [t(["1", "5"], ["5 km = 3.11 miles"]),
     t(["1", "42.195"], ["42.195 km = 26.22 miles"]),
     t(["2", "37"], ["37 degrees Celsius = 98.6 degrees Fahrenheit"]),
     t(["2", "100"], ["100 degrees Celsius = 212.0 degrees Fahrenheit"]),
     t(["1", "0.5"], ["0.5 km = 0.31 miles"], hidden=True),
     t(["2", "-40"], ["-40 degrees Celsius = -40.0 degrees Fahrenheit"], hidden=True),
     t(["2", "36.6"], ["36.6 degrees Celsius = 97.9 degrees Fahrenheit"], hidden=True)]))

# 4 ------------------------------------------------------- number guessing
PROJECTS.append(proj(
    "mini-04-number-guessing", "Mini Project 4: Number Guessing Game (fixed secret)", "Mini Projects",
    """Build a number guessing game. The secret number is read from input so the
game can be tested automatically.

Input (two lines):
Line 1: the secret number (an integer)
Line 2: space-separated guesses, e.g. 10 50 30 42

The program must respond to each guess in order:
- guess < secret  -> print: Too low!
- guess > secret  -> print: Too high!
- guess == secret -> print: Correct! You got it in <k> tries!
  (<k> = number of guesses used so far, counting this one)
  and STOP reading further guesses.

If all guesses are used without success print:
Game over! The number was <secret>

Example
Input:
42
10 50 41 42
Output:
Too low!
Too high!
Too low!
Correct! You got it in 4 tries!""",
    "# Number Guessing Game\nsecret = int(input(\"Enter the secret number: \"))\n# TODO: read the guesses line, process each guess, stop after the correct one\n",
    'secret = int(input("Enter the secret number: "))\nguesses = input("Enter your guesses: ").split()\ntries = 0\nwon = False\nfor g in guesses:\n    tries += 1\n    guess = int(g)\n    if guess < secret:\n        print("Too low!")\n    elif guess > secret:\n        print("Too high!")\n    else:\n        print(f"Correct! You got it in {tries} tries!")\n        won = True\n        break\nif not won:\n    print(f"Game over! The number was {secret}")\n',
    [t(["42", "10 50 41 42"], ["Too low!", "Too high!", "Too low!", "Correct! You got it in 4 tries!"]),
     t(["7", "7"], ["Correct! You got it in 1 tries!"]),
     t(["100", "1 2 3"], ["Too low!", "Too low!", "Too low!", "Game over! The number was 100"]),
     t(["50", "25 75 50 99"], ["Too low!", "Too high!", "Correct! You got it in 3 tries!"], hidden=True),
     t(["1", "2 3 1"], ["Too high!", "Too high!", "Correct! You got it in 3 tries!"], hidden=True),
     t(["9", "9 9"], ["Correct! You got it in 1 tries!"], hidden=True)]))

# 5 --------------------------------------------------------------- quiz
PROJECTS.append(proj(
    "mini-05-quiz-game", "Mini Project 5: Quiz Game", "Mini Projects",
    """Build a small quiz game. The question bank is provided via input.

Input:
Line 1: N, the number of questions
Then N lines, each: question|optionA|optionB|optionC|correctLetter
  (parts separated by the | character; correctLetter is A, B or C)

The program must print each question with its options, read nothing, then at
the end print the score report:

For each question print exactly:
Q<i>. <question text>
A. <optionA>
B. <optionB>
C. <optionC>
Answer: <correctLetter>

After all questions print exactly two lines:
Total Questions: <N>
Your Score: <count of questions whose answer is A>x / <N>
  wait - no. Score counts how many correct answers are the letter A is NOT
  required. Simply print the number of questions whose correctLetter is 'A'
  as "score" is wrong. Print instead:
Your Score: <N> out of <N>
  i.e. every question is worth 1 point and the full key is shown, so the
  final line is: Your Score: <N> out of <N>

Example
Input:
2
What is 2+2?|3|4|5|B
Capital of India?|Mumbai|Delhi|Chennai|B
Output:
Q1. What is 2+2?
A. 3
B. 4
C. 5
Answer: B
Q2. Capital of India?
A. Mumbai
B. Delhi
C. Chennai
Answer: B
Total Questions: 2
Your Score: 2 out of 2

(The score line always shows the full score because the key is revealed.)""",
    "# Quiz Game\nn = int(input(\"Enter number of questions: \"))\n# TODO: read each question line, split on |, print the formatted block\n",
    'n = int(input("Enter number of questions: "))\nfor i in range(1, n + 1):\n    line = input()\n    parts = line.split("|")\n    q, a, b, c, ans = parts[0], parts[1], parts[2], parts[3], parts[4]\n    print(f"Q{i}. {q}")\n    print(f"A. {a}")\n    print(f"B. {b}")\n    print(f"C. {c}")\n    print(f"Answer: {ans}")\nprint(f"Total Questions: {n}")\nprint(f"Your Score: {n} out of {n}")\n',
    [t(["2", "What is 2+2?|3|4|5|B", "Capital of India?|Mumbai|Delhi|Chennai|B"],
       ["Q1. What is 2+2?", "A. 3", "B. 4", "C. 5", "Answer: B",
        "Q2. Capital of India?", "A. Mumbai", "B. Delhi", "C. Chennai", "Answer: B",
        "Total Questions: 2", "Your Score: 2 out of 2"]),
     t(["1", "Sun rises in the?|West|East|North|B"],
       ["Q1. Sun rises in the?", "A. West", "B. East", "C. North", "Answer: B",
        "Total Questions: 1", "Your Score: 1 out of 1"]),
     t(["3", "1+1?|1|2|3|B", "5-3?|2|3|4|A", "10/2?|4|5|6|B"],
       ["Q1. 1+1?", "A. 1", "B. 2", "C. 3", "Answer: B",
        "Q2. 5-3?", "A. 2", "B. 3", "C. 4", "Answer: A",
        "Q3. 10/2?", "A. 4", "B. 5", "C. 6", "Answer: B",
        "Total Questions: 3", "Your Score: 3 out of 3"], hidden=True),
     t(["1", "Python creator?|Guido|Dennis|James|A"],
       ["Q1. Python creator?", "A. Guido", "B. Dennis", "C. James", "Answer: A",
        "Total Questions: 1", "Your Score: 1 out of 1"], hidden=True)]))

# 6 ------------------------------------------------------ currency counter
PROJECTS.append(proj(
    "mini-06-currency-denominations", "Mini Project 6: Currency Denomination Counter", "Mini Projects",
    """An ATM counts the minimum number of notes. Indian denominations available:
500, 200, 100, 50, 20, 10, 5, 2, 1.

Input: one line with a single integer amount.
Output: for every denomination USED (in the order 500,200,100,50,20,10,5,2,1)
print exactly:
<k> x <denomination>
Then print exactly:
Total notes: <total number of notes used>

Example
Input:
683
Output:
1 x 500
1 x 100
1 x 50
1 x 20
1 x 10
1 x 2
1 x 1
Total notes: 7

Example
Input:
400
Output:
2 x 200
Total notes: 2""",
    "# Currency Denomination Counter\namount = int(input(\"Enter amount: \"))\n# TODO: greedy counting from 500 down to 1, print each used denomination\n",
    'amount = int(input("Enter amount: "))\ndenoms = [500, 200, 100, 50, 20, 10, 5, 2, 1]\ntotal = 0\nfor d in denoms:\n    count = amount // d\n    if count > 0:\n        print(f"{count} x {d}")\n        total += count\n        amount -= count * d\nprint(f"Total notes: {total}")\n',
    [t(["683"], ["1 x 500", "1 x 100", "1 x 50", "1 x 20", "1 x 10", "1 x 2", "1 x 1", "Total notes: 7"]),
     t(["400"], ["2 x 200", "Total notes: 2"]),
     t(["1"], ["1 x 1", "Total notes: 1"]),
     t(["2889"], ["5 x 500", "1 x 200", "1 x 100", "1 x 50", "1 x 20", "1 x 10", "1 x 5", "2 x 2", "Total notes: 13"], hidden=True),
     t(["77"], ["1 x 50", "1 x 20", "1 x 5", "1 x 2", "Total notes: 4"], hidden=True),
     t(["500"], ["1 x 500", "Total notes: 1"], hidden=True)]))

# 7 ---------------------------------------------------------- password gen
PROJECTS.append(proj(
    "mini-07-password-strength", "Mini Project 7: Password Strength Checker", "Mini Projects",
    """Build a password strength checker.

Input: one line containing the password (it may contain spaces - read the
whole line; a password made only of spaces is not tested).

Rules (checked in this order, first match wins):
- length < 6                                        -> print: Weak
- length >= 6 AND length <= 10                      -> print: Medium
- length > 10 AND has digit AND has uppercase       -> print: Strong
- length > 10 (otherwise)                           -> print: Medium

Example
Input:
abc
Output:
Weak
Example
Input:
hello world
Output:
Medium
Example
Input:
HelloWorld123
Output:
Strong""",
    "# Password Strength Checker\npassword = input(\"Enter password: \")\n# TODO: apply the rules in order and print exactly one word\n",
    'password = input("Enter password: ")\nlength = len(password)\nif length < 6:\n    print("Weak")\nelif length <= 10:\n    print("Medium")\nelif any(ch.isdigit() for ch in password) and any(ch.isupper() for ch in password):\n    print("Strong")\nelse:\n    print("Medium")\n',
    [t(["abc"], ["Weak"]),
     t(["hello world"], ["Medium"]),
     t(["HelloWorld123"], ["Strong"]),
     t(["abcdef"], ["Medium"], hidden=True),
     t(["12345"], ["Weak"], hidden=True),
     t(["this is a long password"], ["Medium"], hidden=True),
     t(["Abcdefghij12345"], ["Strong"], hidden=True)]))

# 8 ------------------------------------------------------ electricity bill
PROJECTS.append(proj(
    "mini-08-electricity-bill", "Mini Project 8: Electricity Bill Calculator", "Mini Projects",
    """Build an electricity bill calculator with slab rates.

Input: one line, units consumed (an integer).
Slab rates (charged progressively, like income tax slabs):
- first 100 units: 3.50 per unit
- next 100 units (101-200): 4.50 per unit
- above 200 units: 6.00 per unit
Fixed meter charge is always added: 50.00

Print EXACTLY one line:
Bill: <amount rounded to 2 decimals>

Example (150 units -> 100*3.50 + 50*4.50 + 50 fixed)
Input:
150
Output:
Bill: 625.0

Example
Input:
250
Output:
Bill: 1150.0

Note: round(x, 2) prints 725.0 for 725.00 - that exact format is expected.""",
    "# Electricity Bill Calculator\nunits = int(input(\"Enter units consumed: \"))\n# TODO: compute slab bill + 50 meter charge, print 'Bill: <x>'\n",
    'units = int(input("Enter units consumed: "))\nbill = 0.0\nif units <= 100:\n    bill = units * 3.50\nelif units <= 200:\n    bill = 100 * 3.50 + (units - 100) * 4.50\nelse:\n    bill = 100 * 3.50 + 100 * 4.50 + (units - 200) * 6.00\nbill += 50.0\nprint(f"Bill: {round(bill, 2)}")\n',
    [t(["150"], ["Bill: 625.0"]),
     t(["250"], ["Bill: 1150.0"]),
     t(["50"], ["Bill: 225.0"]),
     t(["0"], ["Bill: 50.0"]),
     t(["100"], ["Bill: 400.0"]),
     t(["201"], ["Bill: 856.0"], hidden=True),
     t(["500"], ["Bill: 2650.0"], hidden=True),
     t(["175"], ["Bill: 737.5"], hidden=True)]))

# 9 ------------------------------------------------------- temperature log
PROJECTS.append(proj(
    "mini-09-temperature-analyzer", "Mini Project 9: Temperature Analyzer", "Mini Projects",
    """Build a weather-log analyzer.

Input (two lines):
Line 1: N, how many temperature readings follow (integer, N >= 1)
Line 2: N readings separated by spaces (integers, Celsius)

Print EXACTLY four lines:
Highest: <max reading>
Lowest: <min reading>
Average: <average rounded to 2 decimals>
Above Average Days: <how many readings are strictly greater than the average>

Example
Input:
5
30 32 28 35 31
Output:
Highest: 35
Lowest: 28
Average: 31.2
Above Average Days: 2""",
    "# Temperature Analyzer\nn = int(input(\"How many readings? \"))\n# TODO: read the readings line, compute max, min, average, above-average count\n",
    'n = int(input("How many readings? "))\nreadings = list(map(int, input("Enter readings: ").split()))\nhighest = max(readings)\nlowest = min(readings)\naverage = round(sum(readings) / len(readings), 2)\nabove = sum(1 for r in readings if r > sum(readings) / len(readings))\nprint(f"Highest: {highest}")\nprint(f"Lowest: {lowest}")\nprint(f"Average: {average}")\nprint(f"Above Average Days: {above}")\n',
    [t(["5", "30 32 28 35 31"], ["Highest: 35", "Lowest: 28", "Average: 31.2", "Above Average Days: 2"]),
     t(["1", "25"], ["Highest: 25", "Lowest: 25", "Average: 25.0", "Above Average Days: 0"]),
     t(["4", "10 20 30 40"], ["Highest: 40", "Lowest: 10", "Average: 25.0", "Above Average Days: 2"]),
     t(["6", "-5 0 5 -10 8 4"], ["Highest: 8", "Lowest: -10", "Average: 0.33", "Above Average Days: 3"], hidden=True),
     t(["3", "7 7 7"], ["Highest: 7", "Lowest: 7", "Average: 7.0", "Above Average Days: 0"], hidden=True),
     t(["7", "12 14 16 18 20 22 24"], ["Highest: 24", "Lowest: 12", "Average: 18.0", "Above Average Days: 3"], hidden=True)]))

# 10 ------------------------------------------------------- word counter
PROJECTS.append(proj(
    "mini-10-word-counter", "Mini Project 10: Word Counter & Analyzer", "Mini Projects",
    """Build a text analyzer for a single sentence.

Input: one line of text (may contain spaces; NOT empty).

Print EXACTLY five lines:
Words: <number of words>
Characters: <total characters including spaces>
Characters without spaces: <total minus space characters>
Longest Word: <longest word; if tie, the first occurring one>
Uppercase Count: <number of uppercase letters>

Example
Input:
I love Python programming
Output:
Words: 4
Characters: 25
Characters without spaces: 22
Longest Word: programming
Uppercase Count: 2""",
    "# Word Counter\nsentence = input(\"Enter a sentence: \")\n# TODO: split into words and print the five required lines\n",
    'sentence = input("Enter a sentence: ")\nwords = sentence.split()\nlongest = ""\nfor w in words:\n    if len(w) > len(longest):\n        longest = w\nupper_count = sum(1 for ch in sentence if ch.isupper())\nno_spaces = len(sentence) - sentence.count(chr(32))\nprint(f"Words: {len(words)}")\nprint(f"Characters: {len(sentence)}")\nprint(f"Characters without spaces: {no_spaces}")\nprint(f"Longest Word: {longest}")\nprint(f"Uppercase Count: {upper_count}")\n',
    [t(["I love Python programming"], ["Words: 4", "Characters: 25", "Characters without spaces: 22", "Longest Word: programming", "Uppercase Count: 2"]),
     t(["hello"], ["Words: 1", "Characters: 5", "Characters without spaces: 5", "Longest Word: hello", "Uppercase Count: 0"]),
     t(["A B AB"], ["Words: 3", "Characters: 6", "Characters without spaces: 4", "Longest Word: AB", "Uppercase Count: 4"], hidden=True),
     t(["Kaveri Academy teaches Python"], ["Words: 4", "Characters: 29", "Characters without spaces: 26", "Longest Word: Academy", "Uppercase Count: 3"], hidden=True),
     t(["aBcD eFgH"], ["Words: 2", "Characters: 9", "Characters without spaces: 8", "Longest Word: aBcD", "Uppercase Count: 4"], hidden=True)]))

# 11 ---------------------------------------------------- expense tracker
PROJECTS.append(proj(
    "mini-11-expense-tracker", "Mini Project 11: Expense Tracker", "Mini Projects",
    """Build a mini expense tracker.

Input:
Line 1: N, the number of expenses
Then N lines, each: <category> <amount>   (single space separator,
amount is a number; categories are single words like food, travel)

Print EXACTLY:
Total Spent: <sum of all amounts rounded to 2>
Highest: <category with the highest total amount>
  (if tie on total, the category that reached its total first in input order
   wins - simple approach: first category in input order with max total)
Average: <total / N rounded to 2>

Example
Input:
4
food 250
travel 100
food 50
travel 200
Output:
Total Spent: 600.0
Highest: food
Average: 150.0""",
    "# Expense Tracker\nn = int(input(\"How many expenses? \"))\n# TODO: read each 'category amount' line and report totals\n",
    'n = int(input("How many expenses? "))\ntotals = {}\norder = []\nfor _ in range(n):\n    parts = input().split()\n    category, amount = parts[0], float(parts[1])\n    if category not in totals:\n        totals[category] = 0.0\n        order.append(category)\n    totals[category] += amount\ngrand = round(sum(totals.values()), 2)\nhighest = max(order, key=lambda c: totals[c])\naverage = round(grand / n, 2)\nprint(f"Total Spent: {grand}")\nprint(f"Highest: {highest}")\nprint(f"Average: {average}")\n',
    [t(["4", "food 250", "travel 100", "food 50", "travel 200"], ["Total Spent: 600.0", "Highest: food", "Average: 150.0"]),
     t(["1", "books 499.5"], ["Total Spent: 499.5", "Highest: books", "Average: 499.5"]),
     t(["3", "a 10", "b 10", "c 10"], ["Total Spent: 30.0", "Highest: a", "Average: 10.0"]),
     t(["5", "x 1.25", "y 2.5", "x 0.75", "y 2.5", "z 3"], ["Total Spent: 10.0", "Highest: y", "Average: 2.0"], hidden=True),
     t(["2", "snacks 45", "movies 300"], ["Total Spent: 345.0", "Highest: movies", "Average: 172.5"], hidden=True)]))

# 12 ------------------------------------------------------- to-do manager
PROJECTS.append(proj(
    "mini-12-todo-app", "Mini Project 12: Todo App (console)", "Mini Projects",
    """Build your own console Todo app. The tasks and commands are provided via
input so the app can be tested automatically.

Input:
Line 1: N, number of initial tasks
Then N lines, each an initial task title (single line text)
Then one line: M, number of commands
Then M lines, each a command:
  done <task number>   -> mark that task done (task numbers start at 1,
                          based on position in the CURRENT list)
  remove <task number> -> delete that task from the list
  (any other command lines are ignored)

Output: print the final list state, one line per remaining task, in order:
[<status>] <title>
where <status> is DONE or TODO.
If no tasks remain print exactly: No tasks

Example
Input:
3
Buy milk
Study Python
Call friend
3
done 1
remove 2
done 2
Output:
[DONE] Buy milk
[DONE] Call friend

Explanation: after 'done 1' task 1 is DONE; 'remove 2' deletes 'Study
Python'; the list is now [Buy milk(DONE), Call friend(TODO)]; 'done 2'
marks Call friend DONE.""",
    "# Todo App\ntasks = []\nn = int(input(\"How many initial tasks? \"))\n# TODO: read tasks, then commands, then print the final state\n",
    'tasks = []\nn = int(input("How many initial tasks? "))\nfor _ in range(n):\n    tasks.append([input(), "TODO"])\nm = int(input("How many commands? "))\nfor _ in range(m):\n    parts = input().split(maxsplit=1)\n    cmd = parts[0]\n    if cmd == "done" and len(parts) == 2 and parts[1].isdigit():\n        idx = int(parts[1]) - 1\n        if 0 <= idx < len(tasks):\n            tasks[idx][1] = "DONE"\n    elif cmd == "remove" and len(parts) == 2 and parts[1].isdigit():\n        idx = int(parts[1]) - 1\n        if 0 <= idx < len(tasks):\n            tasks.pop(idx)\nif tasks:\n    for title, status in tasks:\n        print(f"[{status}] {title}")\nelse:\n    print("No tasks")\n',
    [t(["3", "Buy milk", "Study Python", "Call friend", "3", "done 1", "remove 2", "done 2"],
       ["[DONE] Buy milk", "[DONE] Call friend"]),
     t(["1", "Only task", "1", "remove 1"], ["No tasks"]),
     t(["2", "A", "B", "0"], ["[TODO] A", "[TODO] B"]),
     t(["4", "T1", "T2", "T3", "T4", "4", "done 4", "remove 1", "done 1", "done 2"],
       ["[DONE] T2", "[DONE] T3", "[DONE] T4"], hidden=True),
     t(["2", "X", "Y", "2", "remove 5", "done 0"], ["[TODO] X", "[TODO] Y"], hidden=True),
     t(["0", "1", "done 1"], ["No tasks"], hidden=True)]))

# 13 --------------------------------------------------- contact book
PROJECTS.append(proj(
    "mini-13-contact-book", "Mini Project 13: Contact Book", "Mini Projects",
    """Build a Contact Book with a dictionary.

Input:
Line 1: N, number of saved contacts
Then N lines, each: <name> <10-digit phone number>  (single space)
Then one line: Q, number of lookups
Then Q lines, each: a name to search (exact match)

For each lookup print exactly:
<name>: <phone>
or, when not found:
<name>: Not found

Example
Input:
2
Anil 9876543210
Priya 9123456780
3
Anil
Ravi
Priya
Output:
Anil: 9876543210
Ravi: Not found
Priya: 9123456780""",
    "# Contact Book\ncontacts = {}\nn = int(input(\"How many contacts? \"))\n# TODO: save contacts, then answer lookups\n",
    'contacts = {}\nn = int(input("How many contacts? "))\nfor _ in range(n):\n    name, phone = input().split()\n    contacts[name] = phone\nq = int(input("How many lookups? "))\nfor _ in range(q):\n    name = input()\n    if name in contacts:\n        print(f"{name}: {contacts[name]}")\n    else:\n        print(f"{name}: Not found")\n',
    [t(["2", "Anil 9876543210", "Priya 9123456780", "3", "Anil", "Ravi", "Priya"],
       ["Anil: 9876543210", "Ravi: Not found", "Priya: 9123456780"]),
     t(["1", "Solo 9000000000", "2", "Solo", "solo"], ["Solo: 9000000000", "solo: Not found"]),
     t(["0", "1", "Nobody"], ["Nobody: Not found"]),
     t(["3", "B 1111111111", "A 2222222222", "C 3333333333", "3", "C", "A", "B"],
       ["C: 3333333333", "A: 2222222222", "B: 1111111111"], hidden=True),
     t(["1", "Kiran 1234567890", "0"], [], hidden=True)]))

# 14 ---------------------------------------------------- rock paper scissors
PROJECTS.append(proj(
    "mini-14-rock-paper-scissors", "Mini Project 14: Rock Paper Scissors (fixed computer)", "Mini Projects",
    """Play Rock-Paper-Scissors against a computer whose moves are given in the
input (so the game is deterministic and testable).

Input (two lines):
Line 1: the computer's moves, space-separated words from rock/paper/scissors
Line 2: the player's moves, space-separated words from rock/paper/scissors
(both lines have the same count of moves)

Rules: rock beats scissors, paper beats rock, scissors beats paper,
same move is a tie.

Score: win = 1 point for the winner, tie = 1 point for each? NO - keep it
simple: each round the winner gets 1 point, a tie gives nobody a point.

Print EXACTLY three lines:
Player: <player points>
Computer: <computer points>
Result: <You win!|Computer wins!|It's a tie!>
(the Result line compares total points; equal points -> It's a tie!)

Example
Input:
rock paper scissors
paper scissors rock
Output:
Player: 3
Computer: 0
Result: You win!""",
    "# Rock Paper Scissors\ncomputer_moves = input(\"Enter computer moves: \").split()\n# TODO: read player moves, score each round, print the result\n",
    'computer_moves = input("Enter computer moves: ").split()\nplayer_moves = input("Enter your moves: ").split()\nbeats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}\np_score = 0\nc_score = 0\nfor p, c in zip(player_moves, computer_moves):\n    if p == c:\n        pass\n    elif beats[p] == c:\n        p_score += 1\n    else:\n        c_score += 1\nprint(f"Player: {p_score}")\nprint(f"Computer: {c_score}")\nif p_score > c_score:\n    print("Result: You win!")\nelif c_score > p_score:\n    print("Result: Computer wins!")\nelse:\n    print("Result: It\'s a tie!")\n',
    [t(["rock paper scissors", "paper scissors rock"], ["Player: 3", "Computer: 0", "Result: You win!"]),
     t(["rock rock rock", "scissors paper rock"], ["Player: 1", "Computer: 1", "Result: It's a tie!"]),
     t(["paper", "scissors"], ["Player: 1", "Computer: 0", "Result: You win!"]),
     t(["rock paper", "rock paper"], ["Player: 0", "Computer: 0", "Result: It's a tie!"], hidden=True),
     t(["scissors scissors scissors", "rock paper scissors"], ["Player: 1", "Computer: 1", "Result: It's a tie!"], hidden=True),
     t(["rock", "paper"], ["Player: 1", "Computer: 0", "Result: You win!"], hidden=True)]))

# 15 ---------------------------------------------------- palindrome checker
PROJECTS.append(proj(
    "mini-15-palindrome-tool", "Mini Project 15: Palindrome Checker", "Mini Projects",
    """Build a palindrome checker for sentences.

Input:
Line 1: N, the number of sentences
Then N lines, each a sentence (letters, digits and spaces; case must be
ignored; spaces must be ignored; punctuation is not tested)

For each sentence print exactly one line:
Yes
or
No

A sentence is a palindrome when it reads the same forwards and backwards
after ignoring case and spaces.

Example
Input:
3
Never odd or even
Hello
A man a plan a canal Panama
Output:
Yes
No
Yes""",
    "# Palindrome Checker\nn = int(input(\"How many sentences? \"))\n# TODO: for each sentence, ignore case+spaces and check the palindrome\n",
    'n = int(input("How many sentences? "))\nfor _ in range(n):\n    s = input().replace(" ", "").lower()\n    if s == s[::-1]:\n        print("Yes")\n    else:\n        print("No")\n',
    [t(["3", "Never odd or even", "Hello", "A man a plan a canal Panama"], ["Yes", "No", "Yes"]),
     t(["1", "racecar"], ["Yes"]),
     t(["2", "Python", "madam"], ["No", "Yes"]),
     t(["2", "Was it a car or a cat I saw", "Kaveri"], ["Yes", "No"], hidden=True),
     t(["1", "a"], ["Yes"], hidden=True),
     t(["1", "Ab ba"], ["Yes"], hidden=True)]))

# 16 ------------------------------------------------- multiplication tables
PROJECTS.append(proj(
    "mini-16-times-table", "Mini Project 16: Multiplication Table Generator", "Mini Projects",
    """Build a multiplication table generator.

Input: one line with the number N (integer 1..20).

Print the table of N from 1 to 10, EXACTLY in this format:
N x 1 = N1
N x 2 = N2
...
N x 10 = N10
(where N is the number and Nx is the product)

Example
Input:
7
Output:
7 x 1 = 7
7 x 2 = 14
7 x 3 = 21
7 x 4 = 28
7 x 5 = 35
7 x 6 = 42
7 x 7 = 49
7 x 8 = 56
7 x 9 = 63
7 x 10 = 70""",
    "# Multiplication Table\nn = int(input(\"Enter a number: \"))\n# TODO: print the table from 1 to 10\n",
    'n = int(input("Enter a number: "))\nfor i in range(1, 11):\n    print(f"{n} x {i} = {n * i}")\n',
    [t(["7"], [f"7 x {i} = {7*i}" for i in range(1, 11)]),
     t(["1"], [f"1 x {i} = {i}" for i in range(1, 11)]),
     t(["12"], [f"12 x {i} = {12*i}" for i in range(1, 11)], hidden=True),
     t(["20"], [f"20 x {i} = {20*i}" for i in range(1, 11)], hidden=True)]))

# 17 ------------------------------------------------------- grade manager
PROJECTS.append(proj(
    "mini-17-grade-manager", "Mini Project 17: Student Grade Manager", "Mini Projects",
    """Build a grade manager for one class.

Input:
Line 1: N students
Then N lines: <name> <marks>   (marks is an integer 0..100)

For each student print exactly one line:
<name>: <grade>
Grade rules:
marks >= 90 -> A+
marks >= 75 -> A
marks >= 60 -> B
marks >= 40 -> C
marks <  40 -> F

Then print exactly two class summary lines:
Class Average: <average of marks rounded to 1 decimal>
Topper: <name of the student with the highest marks (first on tie)>

Example
Input:
3
Anil 92
Priya 68
Ravi 45
Output:
Anil: A+
Priya: B
Ravi: C
Class Average: 68.3
Topper: Anil""",
    "# Grade Manager\nn = int(input(\"How many students? \"))\n# TODO: read name+marks, print grades, then the class summary\n",
    'n = int(input("How many students? "))\nstudents = []\nfor _ in range(n):\n    parts = input().split()\n    students.append((parts[0], int(parts[1])))\ntotal = 0\nfor name, marks in students:\n    total += marks\n    if marks >= 90:\n        grade = "A+"\n    elif marks >= 75:\n        grade = "A"\n    elif marks >= 60:\n        grade = "B"\n    elif marks >= 40:\n        grade = "C"\n    else:\n        grade = "F"\n    print(f"{name}: {grade}")\nprint(f"Class Average: {round(total / n, 1)}")\ntopper = max(students, key=lambda s: s[1])[0]\nprint(f"Topper: {topper}")\n',
    [t(["3", "Anil 92", "Priya 68", "Ravi 45"], ["Anil: A+", "Priya: B", "Ravi: C", "Class Average: 68.3", "Topper: Anil"]),
     t(["2", "A 100", "B 0"], ["A: A+", "B: F", "Class Average: 50.0", "Topper: A"]),
     t(["1", "Solo 75"], ["Solo: A", "Class Average: 75.0", "Topper: Solo"]),
     t(["4", "X 39", "Y 40", "Z 89", "W 90"], ["X: F", "Y: C", "Z: A", "W: A+", "Class Average: 64.5", "Topper: W"], hidden=True),
     t(["2", "B 50", "A 50"], ["B: C", "A: C", "Class Average: 50.0", "Topper: B"], hidden=True),
     t(["3", "P 60", "Q 60", "R 60"], ["P: B", "Q: B", "R: B", "Class Average: 60.0", "Topper: P"], hidden=True)]))

# 18 ------------------------------------------------------- bank account
PROJECTS.append(proj(
    "mini-18-bank-account", "Mini Project 18: Bank Account Simulator", "Mini Projects",
    """Simulate a bank account. Start with balance 0. Process a list of
operations in order.

Input:
Line 1: N operations
Then N lines, each one of:
  deposit <amount>
  withdraw <amount>
  balance
Rules: a withdrawal is allowed only if the balance stays >= 0 after it;
otherwise print exactly: Insufficient balance
Print exactly one line per operation, in order:
  deposit -> Deposited <amount>. Balance: <balance>
  withdraw -> Withdrew <amount>. Balance: <balance>
  balance -> Balance: <balance>
Amounts are integers. Print the balance as an integer (no decimals).

Example
Input:
5
deposit 1000
withdraw 400
balance
withdraw 700
balance
Output:
Deposited 1000. Balance: 1000
Withdrew 400. Balance: 600
Balance: 600
Insufficient balance
Balance: 600""",
    "# Bank Account Simulator\nbalance = 0\nn = int(input(\"How many operations? \"))\n# TODO: process deposits, withdrawals and balance queries in order\n",
    'balance = 0\nn = int(input("How many operations? "))\nfor _ in range(n):\n    parts = input().split()\n    op = parts[0]\n    if op == "deposit":\n        amount = int(parts[1])\n        balance += amount\n        print(f"Deposited {amount}. Balance: {balance}")\n    elif op == "withdraw":\n        amount = int(parts[1])\n        if balance - amount >= 0:\n            balance -= amount\n            print(f"Withdrew {amount}. Balance: {balance}")\n        else:\n            print("Insufficient balance")\n    else:\n        print(f"Balance: {balance}")\n',
    [t(["5", "deposit 1000", "withdraw 400", "balance", "withdraw 700", "balance"],
       ["Deposited 1000. Balance: 1000", "Withdrew 400. Balance: 600", "Balance: 600", "Insufficient balance", "Balance: 600"]),
     t(["3", "deposit 500", "withdraw 500", "balance"], ["Deposited 500. Balance: 500", "Withdrew 500. Balance: 0", "Balance: 0"]),
     t(["1", "balance"], ["Balance: 0"]),
     t(["4", "deposit 100", "withdraw 1", "withdraw 99", "balance"],
       ["Deposited 100. Balance: 100", "Withdrew 1. Balance: 99", "Withdrew 99. Balance: 0", "Balance: 0"], hidden=True),
     t(["2", "withdraw 1", "balance"], ["Insufficient balance", "Balance: 0"], hidden=True),
     t(["3", "deposit 250", "deposit 250", "balance"], ["Deposited 250. Balance: 250", "Deposited 250. Balance: 500", "Balance: 500"], hidden=True)]))

# 19 -------------------------------------------- library fine calculator
PROJECTS.append(proj(
    "mini-19-library-fine", "Mini Project 19: Library Fine Calculator", "Mini Projects",
    """A library charges fines progressively:
- first 5 days late: 2 rupees per day
- next 5 days (6-10): 5 rupees per day
- after 10 days: 10 rupees per day
Returning on time (0 days late) has no fine.

Input: one line, days late (integer >= 0).

Print EXACTLY one line:
Fine: <total fine in rupees>

Examples
Input:
3
Output:
Fine: 6
Input:
8
Output:
Fine: 25        (5*2 + 3*5)
Input:
0
Output:
Fine: 0""",
    "# Library Fine Calculator\ndays = int(input(\"Enter days late: \"))\n# TODO: compute the progressive fine\n",
    'days = int(input("Enter days late: "))\nfine = 0\nif days <= 5:\n    fine = days * 2\nelif days <= 10:\n    fine = 5 * 2 + (days - 5) * 5\nelse:\n    fine = 5 * 2 + 5 * 5 + (days - 10) * 10\nprint(f"Fine: {fine}")\n',
    [t(["3"], ["Fine: 6"]),
     t(["8"], ["Fine: 25"]),
     t(["0"], ["Fine: 0"]),
     t(["5"], ["Fine: 10"]),
     t(["10"], ["Fine: 35"]),
     t(["15"], ["Fine: 85"], hidden=True),
     t(["11"], ["Fine: 45"], hidden=True),
     t(["1"], ["Fine: 2"], hidden=True)]))

# 20 ----------------------------------------------------- tic-tac-toe check
PROJECTS.append(proj(
    "mini-20-tic-tac-toe", "Mini Project 20: Tic-Tac-Toe Winner Checker", "Mini Projects",
    """Read a finished tic-tac-toe board and report the result.

Input: 3 lines, each with 3 characters separated by spaces.
Each character is X, O or - (dash = empty).

Print EXACTLY one line:
- X wins      (if X has three in a row)
- O wins      (if O has three in a row)
- Draw        (otherwise)
A win is any full row, column or diagonal of the same non-empty symbol.
The tests never contain both players winning at once.

Example
Input:
X O X
O X O
O X X
Output:
X wins

(X has the main diagonal positions 1,5,9.)

Example
Input:
X O X
X O O
O X X
Output:
Draw""",
    "# Tic-Tac-Toe Winner Checker\nboard = []\nfor _ in range(3):\n    board.append(input().split())\n# TODO: check rows, columns and diagonals, print the result\n",
    'board = []\nfor _ in range(3):\n    board.append(input().split())\nlines = []\nlines.extend(board)\nlines.extend([[board[r][c] for r in range(3)] for c in range(3)])\nlines.append([board[0][0], board[1][1], board[2][2]])\nlines.append([board[0][2], board[1][1], board[2][0]])\nresult = "Draw"\nfor line in lines:\n    if line[0] != "-" and line[0] == line[1] == line[2]:\n        result = f"{line[0]} wins"\n        break\nprint(result)\n',
    [t(["X O X", "O X O", "O X X"], ["X wins"]),
     t(["X O X", "X O O", "O X X"], ["Draw"]),
     t(["O O X", "O X X", "X - -"], ["X wins"]),  # anti-diagonal X,X,X
     t(["X X O", "X O -", "O - -"], ["O wins"], hidden=True),
     t(["X X X", "O O -", "- - -"], ["X wins"], hidden=True),
     t(["X O X", "O X O", "X O X"], ["X wins"], hidden=True),
     t(["O - O", "- X -", "O - X"], ["Draw"], hidden=True)]))

# ------------------------------------------------------------------ engine
def run_case(solution_code, inp_lines):
    stdin = "\n".join(inp_lines) + "\n"
    r = subprocess.run([sys.executable, "-c", solution_code], input=stdin,
                       capture_output=True, text=True, timeout=10)
    out = r.stdout.replace("\r\n", "\n").strip()
    return out.split("\n") if out else [], r.returncode, r.stderr

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "check":
        failures = 0
        total = 0
        for p in PROJECTS:
            for i, test in enumerate(p["tests"]):
                total += 1
                got, rc, err = run_case(p["solution"], test["inp"])
                want = test["out"]
                if got != want or rc != 0:
                    failures += 1
                    print(f"FAIL {p['id']} #{i+1} hidden={test['hidden']}")
                    print(f"  input={test['inp']!r}")
                    print(f"  want={want!r}")
                    print(f"  got ={got!r} rc={rc}")
                    if err:
                        print(f"  stderr={err.strip()[:300]}")
        print(f"\n{total - failures}/{total} vectors pass across {len(PROJECTS)} projects")
        sys.exit(1 if failures else 0)
    elif mode == "seed":
        for p in PROJECTS:
            payload = {
                "assignment_key": p["id"], "title": p["title"], "topic": p["topic"],
                "question": p["question"], "starter_code": p["starter"],
                "file_name": "main.py", "language": "python",
                "marks": 10, "is_published": True,
                "created_by": "83f33ce5-7ca8-4c28-af46-709e3d491285",
                "tests": [{"input_text": "\n".join(t_["inp"]) + "\n",
                           "expected_output": "\n".join(t_["out"]),
                           "is_hidden": t_["hidden"], "position": i + 1}
                          for i, t_ in enumerate(p["tests"])],
                "batches": ["a81f5ad9-c252-4087-b7ce-75628feb8bf0",
                            "3778803b-1f12-4803-9768-cc0a307742f9"],
            }
            print(json.dumps(payload, ensure_ascii=False))
    else:
        print("unknown mode", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
